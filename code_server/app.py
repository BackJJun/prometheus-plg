import uvicorn
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import httpx
from pydantic import BaseModel
from starlette import status
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()

# 내부 vLLM 서버 URL (예: localhost:8000)
VLLM_API_URL = "http://211.51.63.154:8000/v1/chat/completions"

# CORS 설정 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 또는 특정 origin만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Username"]
)


async def stream_openai_response(data: dict):
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", VLLM_API_URL, json=data) as response:
            async for chunk in response.aiter_bytes():
                yield chunk


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    data = await request.json()

    print(f"data={data}")

    access_token = request.cookies.get("access_token")
    print(f"access_token={access_token}")

    return StreamingResponse(stream_openai_response(data), media_type="text/event-stream")


class LoginData(BaseModel):
    username: str
    password: str


@app.post("/login")
async def login(
        login_data: LoginData,
        response: Response
):
    print(f"로그인 요청옴!! username={login_data.username}, password={login_data.password}")

    response = JSONResponse(content={
        "message": f"로그인 성공",
        "user_name": "현식_이름",
        "access_token": "access_token_v1",
    })

    # response.headers["X-username"] = 'hsid_jsdasndj'  # header에 쿠키와 같은 값

    return response


if __name__ == '__main__':
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
