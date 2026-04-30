import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

RESUMES_DIR = Path(__file__).resolve().parent / "data"

import pickle
from pathlib import Path
DOCS_PATH = RESUMES_DIR / "docs.pkl"
ALL_DOCS: list = []

def load_docs() -> None:
    global ALL_DOCS
    try:
        if DOCS_PATH.exists():
            with DOCS_PATH.open("rb") as f:
                ALL_DOCS = pickle.load(f)
        else:
            ALL_DOCS = []
    except Exception:
        ALL_DOCS = []


def save_docs() -> None:
    try:
        with DOCS_PATH.open("wb") as f:
            pickle.dump(ALL_DOCS, f)
    except Exception as e:
        print(f"[WARN] Failed to save docs: {e}")

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    task_type="retrieval_document",
    google_api_key=os.getenv("GEMINI_API_KEY"),
)

vector_store = PineconeVectorStore(
    index_name=os.getenv("PINECONE_INDEX_NAME"),
    embedding=embeddings,
    pinecone_api_key=os.getenv("PINECONE_API_KEY"),
)

llm = ChatGoogleGenerativeAI(
    model="gemini-flash-latest",
    temperature=0,
    google_api_key=os.getenv("GEMINI_API_KEY"),
)

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a professional Resume Analysis Assistant. 
    Use the provided context to answer questions about the candidate accurately. 
    If the answer isn't in the context, say you don't know based on the documents provided.
    Context: {context}"""),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{question}"),
])


from langchain_community.retrievers import BM25Retriever
from langchain_community.document_compressors.flashrank_rerank import FlashrankRerank
from langchain.retrievers import ContextualCompressionRetriever, EnsembleRetriever 
bm25_retriever: BM25Retriever | None = None

def rebuild_bm25() -> None:
    global bm25_retriever
    if ALL_DOCS:
        bm25_retriever = BM25Retriever.from_documents(ALL_DOCS)
        bm25_retriever.k = 5

def get_hybrid_rerank_retriever():
    global bm25_retriever
    dense_retriever = vector_store.as_retriever(search_type="similarity",search_kwargs={"k": 10})
    if bm25_retriever is None:
        if not ALL_DOCS:
            return dense_retriever
        bm25_retriever = BM25Retriever.from_documents(ALL_DOCS)
        bm25_retriever.k = 5

    ensemble_retriever = EnsembleRetriever(retrievers=[bm25_retriever, dense_retriever],weights=[0.3, 0.7])
    compressor = FlashrankRerank(model="ms-marco-MiniLM-L-12-v2")
    return ContextualCompressionRetriever(base_compressor=compressor,base_retriever=ensemble_retriever)

from langchain_core.chat_history import InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory

_history_store: dict[str, InMemoryChatMessageHistory] = {}
def get_session_history(session_id: str) -> InMemoryChatMessageHistory:
    if session_id not in _history_store:
        _history_store[session_id] = InMemoryChatMessageHistory() 
    return _history_store[session_id]

def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
rag_chain = (
    RunnablePassthrough.assign(
        context=lambda x: format_docs(get_hybrid_rerank_retriever().invoke(x["question"])),
        history=lambda x: x.get("history", []),
    )
    | prompt
    | llm
    | StrOutputParser()
)

rag_with_history = RunnableWithMessageHistory(
    rag_chain,
    get_session_history,
    input_messages_key="question",
    history_messages_key="history",
)

