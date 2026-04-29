from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    question:   str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    answer:        str
    source_resume: Optional[str] = None
    session_id:    str

class ChatMessage(BaseModel):
    id:   str
    role: str
    text: str

class ChatSession(BaseModel):
    id:       str
    title:    str
    messages: list[ChatMessage] = []
