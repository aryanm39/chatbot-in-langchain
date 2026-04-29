from __future__ import annotations
import uuid
from typing import Optional
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import shutil
from rag import RESUMES_DIR,generate_answer,add_index,ensure_indexes_loaded,get_pinecone_store
from session import get_session,new_session,delete_session,session_to_schema
from schemas import ChatMessage, ChatSession, ChatRequest, ChatResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/resumes")
def list_resumes() -> dict:
    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p.name for p in RESUMES_DIR.glob("*.pdf"))
    return {"resumes": files}

@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    RESUMES_DIR.mkdir(parents=True, exist_ok=True)
    dest = RESUMES_DIR / file.filename

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        ensure_indexes_loaded()
        add_index(dest)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=422,detail=f"Failed to index '{file.filename}': {exc}")
    return {"filename": file.filename,"detail":   f"'{file.filename}' uploaded and indexed."}

@app.post("/chat", response_model=ChatResponse)
def ask(request: ChatRequest) -> ChatResponse:
    question = request.question.strip()
    ensure_indexes_loaded()

    vector_store = get_pinecone_store()
    if vector_store is None:
        raise HTTPException(status_code=503, detail="No resumes have been indexed yet.")

    if request.session_id and get_session(request.session_id):
        session_id = request.session_id
    else:
        session_id, _ = new_session()

    answer = generate_answer(question, vector_store, session_id=session_id)
    return ChatResponse(answer=answer, source_resume=None, session_id=session_id)

@app.get("/sessions/{session_id}")
def get_session_detail(session_id: str):
    sess = get_session(session_id)
    if sess is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session_to_schema(session_id, sess)

@app.delete("/sessions/{session_id}")
def delete_session_endpoint(session_id: str):
    if not delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"detail": "Session deleted."}
