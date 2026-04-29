from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Optional
from langchain_core.chat_history import InMemoryChatMessageHistory
from schemas import ChatMessage, ChatSession

@dataclass
class Session:
    history:         InMemoryChatMessageHistory = field(default_factory=InMemoryChatMessageHistory)
    title:           str                        = "Chat"

_sessions: dict[str, Session] = {}

def new_session() -> tuple[str, Session]:
    sid  = str(uuid.uuid4())
    sess = Session()
    _sessions[sid] = sess
    return sid, sess

def get_session(session_id: str) -> Optional[Session]:
    return _sessions.get(session_id)

def delete_session(session_id: str) -> bool:
    return _sessions.pop(session_id, None) is not None

def get_session_history(session_id: str) -> InMemoryChatMessageHistory:
    if session_id not in _sessions:
        _sessions[session_id] = Session()
    return _sessions[session_id].history

def list_sessions() -> list[tuple[str, Session]]:
    return list(_sessions.items())

def session_to_schema(session_id: str, sess: Session) -> ChatSession:
    msgs = sess.history.messages
    api_messages: list[ChatMessage] = []
    i = 0
    while i < len(msgs):
        human = msgs[i]
        api_messages.append(
            ChatMessage(id=str(uuid.uuid4()), role="user", text=human.content)
        )
        i += 1
        if i < len(msgs) and msgs[i].type != "human":
            ai = msgs[i]
            api_messages.append(
                ChatMessage(id=str(uuid.uuid4()), role="bot", text=ai.content)
            )
            i += 1

    return ChatSession(id=session_id,title=sess.title,messages=api_messages)
