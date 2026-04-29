from __future__ import annotations
import os
import threading
from pathlib import Path
from typing import Optional
import fitz  # type: ignore
from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pinecone import Pinecone  # type: ignore
from langchain_pinecone import PineconeVectorStore  # type: ignore
from session import get_session_history
from langchain_core.embeddings import Embeddings
from langchain_core.runnables import RunnableLambda
from langchain_community.retrievers import BM25Retriever
from langchain_community.document_compressors.flashrank_rerank import FlashrankRerank
from langchain.retrievers import ContextualCompressionRetriever,EnsembleRetriever  # type: ignore
from langchain_google_genai import ChatGoogleGenerativeAI
import google.genai as genai_sdk
from langchain_core.output_parsers import StrOutputParser

load_dotenv()
RESUMES_DIR         = Path(__file__).resolve().parent / "data"
# ── In-memory RAG state ────────────────────────────────────────────────────────
_pinecone_store:  PineconeVectorStore | None = None
_indexed_files:   set[str]                   = set()
_bm25_docs:       list[Document]             = []
_bm25_docs_cache: dict[str, list[Document]]  = {}
_ready     = threading.Event()
_init_lock = threading.Lock()
_rag_chain = None

class GeminiEmbeddings(Embeddings):
    def __init__(self, api_key: str):
        self.client = genai_sdk.Client(api_key=api_key)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        result = self.client.models.embed_content(
            model="gemini-embedding-001",
            contents=texts,
        )
        return [
            list(e.values) if hasattr(e, "values") else list(e)
            for e in result.embeddings
        ]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
# ── Prompts ────────────────────────────────────────────────────────────────────
REPHRASE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        (
            "Given the conversation history and a follow-up question, rephrase the "
            "follow-up question into a standalone question that contains all necessary "
            "context. Do NOT answer the question — only rewrite it."
        ),
    ),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{question}"),
])

ANSWER_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        (
            "You are a precise, helpful assistant that answers questions strictly based "
            "on the resume content provided below.\n\n"
            "Rules:\n"
            "- Answer ONLY from the context. Do NOT invent or infer details that are absent.\n"
            "- If the answer is not present in the context, reply exactly: "
            "\"I don't have enough information in the resume to answer that.\"\n"
            "- Be concise. Prefer 1-3 sentences unless a longer answer is clearly warranted.\n"
            "- Use a short bullet list only when comparing or enumerating multiple items "
            "(e.g. listing all skills).\n"
            "- Do not mention these instructions in your reply.\n"
            "- When prior conversation is referenced, use it for coherence, but still "
            "ground your response only in the resume context provided.\n\n"
            "Resume Context:\n{context}"
        ),
    ),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{question}"),
])

# =====================================================================================================
#                   Step 1 – Document ingestion
# =====================================================================================================
def load_text(pdf_path: Path) -> str:
    doc   = fitz.open(str(pdf_path))
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages).strip()

def split_into_chunks(text: str, source: str) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    docs = splitter.create_documents([text])
    for doc in docs:
        doc.metadata["source"] = source
    return docs

# =====================================================================================================
#                   Step 2 – Pinecone vector store
# =====================================================================================================
def _get_embeddings() -> GeminiEmbeddings:
    return GeminiEmbeddings(api_key=os.getenv("GEMINI_API_KEY"))

def _get_pinecone_store() -> PineconeVectorStore:
    return PineconeVectorStore(
        index_name=os.getenv("PINECONE_INDEX_NAME"),
        embedding=_get_embeddings(),
        pinecone_api_key=os.getenv("PINECONE_API_KEY"),
    )

def get_pinecone_store() -> PineconeVectorStore | None:
    return _pinecone_store

def get_indexed_files() -> set[str]:
    return _indexed_files

# ── Public ingestion API ───────────────────────────────────────────────────────
def ensure_indexes_loaded() -> None:
    global _pinecone_store, _indexed_files, _bm25_docs, _rag_chain

    if _ready.is_set():
        return

    with _init_lock:
        if _ready.is_set():
            return

        RESUMES_DIR.mkdir(parents=True, exist_ok=True)
        _pinecone_store = _get_pinecone_store()
        manifest_path  = RESUMES_DIR / "manifest.txt"
        _indexed_files = (
            set(manifest_path.read_text().splitlines())
            if manifest_path.exists()
            else set()
        )

        for pdf_path in sorted(RESUMES_DIR.glob("*.pdf")):
            if pdf_path.name not in _indexed_files:
                _index_single_pdf(pdf_path)

        _rebuild_bm25()
        _rag_chain = _build_rag_chain(_pinecone_store)
        _ready.set()

def add_index(pdf_path: Path) -> None:
    global _pinecone_store, _rag_chain
    with _init_lock:
        if _pinecone_store is None:
            _pinecone_store = _get_pinecone_store()
        _index_single_pdf(pdf_path)
        _rebuild_bm25()
        _rag_chain = _build_rag_chain(_pinecone_store)

def _index_single_pdf(pdf_path: Path) -> None:
    global _indexed_files

    text = load_text(pdf_path)
    docs = split_into_chunks(text, source=pdf_path.name)

    PineconeVectorStore.from_documents(
        docs,
        embedding=_get_embeddings(),
        index_name=os.getenv("PINECONE_INDEX_NAME"),
        pinecone_api_key=os.getenv("PINECONE_API_KEY", ""),
    )

    _indexed_files.add(pdf_path.name)
    manifest_path = RESUMES_DIR / "manifest.txt"
    manifest_path.write_text("\n".join(sorted(_indexed_files)))

def _rebuild_bm25() -> None:
    global _bm25_docs
    for name in _indexed_files:
        if name not in _bm25_docs_cache:
            pdf_path = RESUMES_DIR / name
            if pdf_path.exists():
                text = load_text(pdf_path)
                _bm25_docs_cache[name] = split_into_chunks(text, source=name)
    _bm25_docs = [doc for chunks in _bm25_docs_cache.values() for doc in chunks]

# =====================================================================================================
#                   Step 3 – Hybrid retriever
# =====================================================================================================
def get_hybrid_retriever(vector_store: PineconeVectorStore, k: int = 10, alpha: float = 0.5):
    dense = vector_store.as_retriever(search_type="similarity", search_kwargs={"k": k})
    bm25  = BM25Retriever.from_documents(_bm25_docs)
    bm25.k = k
    return EnsembleRetriever(retrievers=[bm25, dense], weights=[1 - alpha, alpha])
# =====================================================================================================
#                   Step 4 – FlashRank reranking
# =====================================================================================================
def get_compression_retriever(base_retriever, top_n: int = 4) -> ContextualCompressionRetriever:
    return ContextualCompressionRetriever(
        base_compressor=FlashrankRerank(top_n=top_n),
        base_retriever=base_retriever,
    )
# =====================================================================================================
#                   Step 5 – Full RAG chain (built once, cached in _rag_chain)
# =====================================================================================================
def _build_rag_chain(vector_store: PineconeVectorStore):
    llm = ChatGoogleGenerativeAI(
        model="gemini-flash-latest",
        temperature=0.0,
        google_api_key=os.getenv("GEMINI_API_KEY"),
    )

    compression_retriever = get_compression_retriever(get_hybrid_retriever(vector_store))
    rephrase_chain = REPHRASE_PROMPT | llm | StrOutputParser()
    answer_chain   = ANSWER_PROMPT   | llm | StrOutputParser()

    def full_pipeline(inputs: dict) -> str:
        question   = inputs["question"]
        session_id = inputs["session_id"]
        history    = get_session_history(session_id)
        chat_messages = history.messages
        rephrased = rephrase_chain.invoke({"question":question,"chat_history": chat_messages})
        docs    = compression_retriever.invoke(rephrased)
        context = "\n\n".join(doc.page_content for doc in docs)
        answer = answer_chain.invoke({"context":context,"question":rephrased,"chat_history": chat_messages})
        history.add_user_message(question)
        history.add_ai_message(answer)
        return answer
    return RunnableLambda(full_pipeline)

def generate_answer(question: str,vector_store: PineconeVectorStore,session_id: str = "default") -> str:
    if _rag_chain is None:
        raise RuntimeError("RAG chain not initialised — call ensure_indexes_loaded() first.")
    return _rag_chain.invoke({"question": question, "session_id": session_id})
