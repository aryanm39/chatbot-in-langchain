import shutil
from typing import List
from schemas import ChatRequest, ChatResponse
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from rag import vector_store,rag_with_history,RESUMES_DIR,rebuild_bm25,ALL_DOCS,save_docs,load_docs
from langchain_community.document_loaders import PyMuPDFLoader       
from langchain_text_splitters import RecursiveCharacterTextSplitter     
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_docs()
    rebuild_bm25()
    yield
    
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/resumes")
def list_resumes():
    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p.name for p in RESUMES_DIR.glob("*.pdf"))
    return {"resumes": files}

@app.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    splitter = RecursiveCharacterTextSplitter(chunk_size=2000,chunk_overlap=200)

    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    added: list[str] = []

    for file in files:
        file_path = RESUMES_DIR / file.filename
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        try:
            loader = PyMuPDFLoader(str(file_path))
            docs = loader.load()
            chunks = splitter.split_documents(docs)
            for chunk in chunks:
                chunk.metadata["source"] = file.filename
            ALL_DOCS.extend(chunks)
            vector_store.add_documents(chunks)
            added.append(file.filename)

        except Exception:
            file_path.unlink(missing_ok=True)  

    rebuild_bm25()
    save_docs()
    return {"status": "success", "files_added": added}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    config = {"configurable": {"session_id": request.session_id}}
    try:
        answer = rag_with_history.invoke({"question": request.question}, config=config)
        return ChatResponse(answer=answer, session_id=request.session_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
