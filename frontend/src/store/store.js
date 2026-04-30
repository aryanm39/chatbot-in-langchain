import { configureStore } from "@reduxjs/toolkit";
import chatReducer     from "./chatSlice";
import resumesReducer  from "./resumesSlice";
import sessionsReducer from "./sessionsSlice";

const store = configureStore({
  reducer: {
    chat:     chatReducer,
    resumes:  resumesReducer,
    sessions: sessionsReducer,
  },
});

export default store;
