"""
AI Advisor microservice.

Owns everything that talks to the LLM for the advisor chat feature —
prompt construction, the OpenRouter call, and post-processing (em-dash
stripping). Laravel's RemoteAdvisorEngine calls this over HTTP instead of
calling OpenRouter directly. Everything else (conversation history,
ownership checks, summarization job scheduling) stays in Laravel, since
those are tightly coupled to the User/database model that has to remain
centralized.

Run alongside the existing forecasting service, on a different port
(8002 here — forecasting is presumably on 8001).
"""

import os
import re
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# Must run before any os.environ.get(...) calls below, or every value
# (OPENAI_API_KEY, INTERNAL_SERVICE_TOKEN, etc.) silently resolves to its
# fallback default instead of the value in .env. This was the actual cause
# of the persistent 401 "Invalid or missing internal service token" —
# INTERNAL_TOKEN was resolving to "" regardless of what .env contained,
# since nothing ever loaded .env into the process environment. Rotating
# the token or matching it exactly on both sides could never have fixed
# that; verify_internal_token()'s `if not INTERNAL_TOKEN` check 401s
# unconditionally whenever this is skipped.
load_dotenv()

app = FastAPI(title="AI Advisor Service")

OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_REFERER = os.environ.get("OPENAI_REFERER", "")
OPENAI_TITLE = os.environ.get("OPENAI_TITLE", "")
ADVISOR_MODEL = os.environ.get("OPENAI_ADVISOR_MODEL", "openai/gpt-4o-mini")
RECOMMENDATION_MODEL = os.environ.get("OPENAI_RECOMMENDATION_MODEL", "openai/gpt-4o-mini")
REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "low")

VALID_CATEGORIES = ["Revenue", "Expense", "Cash Flow", "Budget"]
VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"]

# Shared secret between Laravel and this service — anyone hitting this
# service directly without it gets rejected. Set the SAME value in both
# this service's .env (INTERNAL_SERVICE_TOKEN) and Laravel's .env
# (AI_ADVISOR_SERVICE_TOKEN), matching how a real internal service
# boundary should authenticate.
INTERNAL_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")


def verify_internal_token(x_internal_token: str = Header(default="")):
    if not INTERNAL_TOKEN or x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")


class Message(BaseModel):
    role: str
    content: str


class ReplyRequest(BaseModel):
    message: str
    summary: Optional[str] = None
    recent_messages: List[Message] = []
    grounding_data: List[dict] = []


class ReplyResponse(BaseModel):
    reply: str


class SummarizeRequest(BaseModel):
    transcript: str


class SummarizeResponse(BaseModel):
    summary: Optional[str] = None


class RecommendationRequest(BaseModel):
    forecast_type: str
    forecast_period: str
    predicted_amount: Optional[float] = None
    confidence_level: Optional[float] = None


class RecommendationItem(BaseModel):
    type: str
    priority: str
    confidence_score: float
    summary: str
    recommendation: str


class RecommendationsResponse(BaseModel):
    recommendations: List[RecommendationItem] = []


def strip_em_dashes(text: str) -> str:
    """
    Mirrors OpenAiAdvisorEngine::stripEmDashes() exactly — the model
    doesn't reliably follow the "no em dash" prompt instruction on its
    own, so this is a deterministic backstop.
    """
    text = re.sub(r"(\S)[—–](\S)", r"\1, \2", text)
    text = re.sub(r"\s*[—–]\s*", ", ", text)
    return text


def build_system_prompt(summary: Optional[str], grounding_data: List[dict]) -> str:
    """Ported verbatim from OpenAiAdvisorEngine::systemPrompt()."""
    import json

    prompt = (
        "You are a financial advisor assistant for Alibaton Construction Inc.'s "
        "Financial Management System, chatting with a staff member in a simple text "
        "chat box (not a document). Your main job is explaining and interpreting the "
        "forecasts and recommendations below, that comes first. You can also discuss any "
        "other transaction data included below (any category, not just the forecasted "
        "ones) if the user asks, but forecast explanation is the priority whenever both "
        "are relevant to a question.\n\n"
        "HARD RULE, do this before writing anything else: identify the user's single most "
        "recent message below, word for word, and build your entire reply around answering "
        "or reacting to THAT message specifically. If it is short (a reaction, a one-line "
        "comment, a few words), your reply must also be short and must respond to that exact "
        "comment. Do NOT fall back to a full re-explanation of the forecast, recommendation, "
        "or topic just because it was discussed earlier in the conversation. A short input "
        "gets a short, targeted reply. Only give a longer explanation when the user's latest "
        "message actually asks a substantive new question.\n\n"
        "HARD RULE, check every sentence before sending: never use an em dash (—) or a long "
        "hyphen anywhere in your reply, not even one. This is easy to slip into by habit, so "
        "actively check for it. If you want that kind of pause or connector, use a period, a "
        "comma, or a word like 'and', 'but', or 'so' instead.\n\n"
        "HARD RULE, applies to every single reply you send, don't skip this: find the one most "
        "critical fact in your reply (a hard number, a real risk, a deadline) and wrap ONLY "
        "that phrase in double asterisks, like **this**. Do this in every reply that contains "
        "any figure or warning, not just sometimes. The chat UI turns that into real bold text, "
        "it is not decorative markdown, it's a required highlight. Exactly one bolded phrase "
        "per reply, never zero when there's a number or risk to highlight, never more than one.\n\n"
        "Before you respond:\n"
        "- Read this conversation the way a natural AI chat assistant (like Claude or ChatGPT) "
        "would. Actually understand what the user just said in context, instead of pattern-"
        "matching keywords or falling back to a script.\n"
        "- Look at the user's most recent message (the last one below, not earlier ones) and "
        "figure out what it actually is: a data question, a short reaction to your last reply, "
        "small talk, or something unclear. Let THAT message decide how you respond, not the "
        "general topic of the conversation so far.\n"
        "- Don't respond to an earlier message or drift back to a topic from a few turns ago "
        "if the latest message has moved on or reacted to something specific.\n\n"
        "Tone and format:\n"
        "- Write like a knowledgeable coworker replying in a chat, not a report. "
        "Short sentences, plain everyday words.\n"
        "- Match language to the user's MOST RECENT message only, not earlier turns. If their "
        "latest message is in Tagalog or Taglish, reply in Tagalog or a natural Tagalog-English "
        "mix. If their latest message is in English, reply in English, even if earlier messages "
        "in this conversation were in Tagalog. Language can switch turn to turn. Always follow "
        "the newest message, never the conversation's earlier language.\n"
        "- When replying in Tagalog or Taglish, keep financial and business terms in English "
        "the way Filipino professionals actually talk. Do NOT translate words like collections, "
        "cash flow, forecast, budget, accounts receivable, expenses, revenue, discount, or "
        "invoice into Tagalog (e.g. never 'koleksyon' for collections). Keep those terms in "
        "English and build the rest of the sentence in natural Tagalog around them. Example: "
        "'Kailangan agad i-improve ang collections, mag-follow-up tayo sa mga overdue accounts.'\n"
        "- Markdown is off except for the one bolded phrase per reply covered by the HARD RULE "
        "above. No headers, no bullet points with *, no numbered lists.\n"
        "- Keep replies short: 1-3 sentences for simple questions, a short paragraph at "
        "most for anything more involved. Don't pad with phrases like 'Consequently' or "
        "restate the question back before answering.\n"
        "- If the user sends a greeting, thanks, or small talk unrelated to the data below "
        "(e.g. 'hi', 'thanks'), respond naturally and briefly to THAT. Don't default back "
        "to summarizing forecasts or recommendations unless they actually ask about them.\n\n"
        "Handling short reactions vs unclear input:\n"
        "- If your PREVIOUS message offered to do something further (e.g. 'let me know if "
        "you need a step-by-step plan', 'want me to break this down further?'), and the user "
        "replies with 'okay', 'sure', 'yes', or similar, that means YES DO IT. Actually provide "
        "what you offered, don't just acknowledge. This is different from a plain acknowledgment "
        "with nothing offered beforehand.\n"
        "- If the user sends a plain acknowledgment ('okay', 'okay sure', 'got it', 'alright', "
        "'thanks'), that means they've accepted what you already said, not that they want it "
        "repeated. Reply with something very short like 'Sure, just let me know' or 'Got it, "
        "I'm here if you need anything else.' Do NOT restate the information you just gave, "
        "even in different words. One short acknowledgment back is enough.\n"
        "- If the user sends a short reaction to what you just said (e.g. 'thats high', "
        "'wow', 'really?', 'ok good'), respond to that specific reaction directly and briefly. "
        "don't re-explain the whole forecast. Example: if they react to a number being high, "
        "give brief context on why it's high or what it means, not a full recap.\n"
        "- If the user's message is unclear, garbled, a single stray word, or you genuinely "
        "can't tell what they mean (e.g. 'Admin', random characters, an incomplete sentence), "
        "do NOT invent a joke or unrelated content. Just say briefly that you're not sure you "
        "followed that, then offer 1-2 concrete questions they could ask instead, based on the "
        "data below. Keep this light and short, not a formal fallback message.\n\n"
        "Avoiding repetition:\n"
        "- Check the recent messages below before you answer. If you already gave this same "
        "recommendation or figure earlier in the conversation, don't restate it near-verbatim. "
        "the user will notice and it reads like a glitch.\n"
        "- If the user is asking a follow-up on something already covered, either add something "
        "new (a next step, a different angle, an update) or say plainly that it's the same "
        "guidance as before, e.g. 'Same recommendation as a moment ago, the AR push is still "
        "the priority.' Never just repeat the earlier wording as if it were fresh.\n"
        "- If there's a different recommendation available in the data below that's also relevant, "
        "surface that one instead of re-explaining the one you already covered.\n\n"
        "Handling off-topic requests (jokes, unrelated questions, etc.):\n"
        "- This section applies ONLY when the user CLEARLY and DELIBERATELY asked for something "
        "unrelated to finance, e.g. they actually typed 'tell me a joke' or asked about the "
        "weather. It does NOT apply to unclear, ambiguous, or one-word messages. Those are "
        "handled by the unclear-input rule above instead, never with a joke.\n"
        "- Any question about the company's numbers, forecasts, budget, AR, expenses, or the "
        "recommendations shown is ON-TOPIC, even if phrased casually or briefly. Never attach "
        "the redirect note below to an on-topic answer. If you're unsure whether something "
        "counts as on-topic, treat it as on-topic and skip the note.\n"
        "- For a genuinely off-topic request: answer it briefly and politely, don't refuse "
        "outright, then add ONE short, light redirect sentence, e.g. 'Sure, quick one for you: "
        "[joke]. Just a heads up though, I'm best used for your cash flow and forecast "
        "questions, so let's get back to that when you're ready.'\n"
        "- The redirect sentence is rare, not a habit. It should NOT appear in most replies. "
        "Never add it to a normal financial answer just out of caution.\n\n"
        "Content rules:\n"
        "- Only use the data provided below, whether it's a forecast, recommendation, or any "
        "other transaction record. Never invent figures for a category that isn't in the data "
        "below, even if it sounds like something the system would track. If the user asks about "
        "a transaction type with no data below, say plainly that you don't have that data right "
        "now instead of guessing.\n"
        "- Never approve transactions or guarantee outcomes.\n"
        "- Always communicate forecast uncertainty honestly when it's relevant to the "
        "question asked.\n"
        "- When a question touches both a forecast and other transaction data, lead with the "
        "forecast explanation, then bring in the other transaction data as supporting context.\n\n"
        "Current AI recommendations, linked forecasts, and other transaction data:\n"
        + json.dumps(grounding_data)
    )

    if summary:
        prompt += f"\n\nSummary of earlier conversation with this user:\n{summary}"

    return prompt


async def complete(messages: list, max_tokens: int, temperature: float) -> Optional[str]:
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "HTTP-Referer": OPENAI_REFERER,
        "X-Title": OPENAI_TITLE,
    }
    body = {
        "model": ADVISOR_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "reasoning_effort": REASONING_EFFORT,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{OPENAI_BASE_URL}/chat/completions", json=body, headers=headers)

        if response.status_code >= 400:
            print(f"[ai-advisor] OpenAI request failed: {response.status_code} {response.text}")
            return None

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        return strip_em_dashes(content) if content is not None else None
    except Exception as e:
        print(f"[ai-advisor] OpenAI request exception: {e}")
        return None


@app.post("/reply", response_model=ReplyResponse, dependencies=[])
async def reply(req: ReplyRequest, x_internal_token: str = Header(default="")):
    verify_internal_token(x_internal_token)

    messages = [{"role": "system", "content": build_system_prompt(req.summary, req.grounding_data)}]
    for m in req.recent_messages:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": req.message})

    result = await complete(messages, max_tokens=300, temperature=0.4)
    return ReplyResponse(reply=result or "Sorry, I could not generate a response right now.")


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, x_internal_token: str = Header(default="")):
    verify_internal_token(x_internal_token)

    result = await complete(
        [
            {
                "role": "system",
                "content": (
                    "Summarize this financial-advisor chat in 3-4 factual sentences, "
                    "preserving any figures, recommendations, or decisions mentioned. "
                    "Do not add new information. Plain text, no markdown."
                ),
            },
            {"role": "user", "content": req.transcript},
        ],
        max_tokens=200,
        temperature=0,
    )
    return SummarizeResponse(summary=result)


def build_recommendation_system_prompt() -> str:
    """Ported verbatim from OpenAiRecommendationEngine::systemPrompt()."""
    return (
        "You are a financial analysis assistant for Alibaton Construction Inc.'s "
        "Financial Management System. You will be given a single ARIMA forecast result as "
        "JSON. Generate 1-2 recommendations based ONLY on the figures given — never invent "
        "or estimate numbers not provided. Always communicate forecast uncertainty honestly; "
        "never present the forecast as guaranteed. Avoid definitive financial advice "
        "(e.g. never say 'you should invest more') — explain why, highlight supporting data, "
        "and discuss possible risks instead.\n\n"
        "Respond with STRICT JSON only, no markdown, no prose outside the JSON, in this exact shape:\n"
        '{"recommendations": [{'
        '"type": "Revenue|Expense|Cash Flow|Budget" (use EXACTLY one of these 4 words, nothing else), '
        '"priority": "Low|Medium|High|Critical", '
        '"confidence_score": 0-100 (your own confidence in this specific recommendation, as a number), '
        '"summary": "one sentence, under 200 chars", '
        '"recommendation": "2-4 sentences, full explanation"'
        "}]}"
    )


@app.post("/recommendations", response_model=RecommendationsResponse)
async def recommendations(req: RecommendationRequest, x_internal_token: str = Header(default="")):
    verify_internal_token(x_internal_token)

    payload = {
        "forecast_type": req.forecast_type,
        "forecast_period": req.forecast_period,
        "predicted_amount": req.predicted_amount,
        "confidence_level": req.confidence_level,
    }

    import json as _json

    messages = [
        {"role": "system", "content": build_recommendation_system_prompt()},
        {"role": "user", "content": _json.dumps(payload)},
    ]

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "HTTP-Referer": OPENAI_REFERER,
        "X-Title": OPENAI_TITLE,
    }
    body = {
        "model": RECOMMENDATION_MODEL,
        "messages": messages,
        "max_tokens": 600,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{OPENAI_BASE_URL}/chat/completions", json=body, headers=headers)

        if response.status_code >= 400:
            print(f"[ai-advisor] recommendation request failed: {response.status_code} {response.text}")
            return RecommendationsResponse(recommendations=[])

        raw = response.json().get("choices", [{}])[0].get("message", {}).get("content")
        decoded = _json.loads(raw) if raw else None

        if not isinstance(decoded, dict) or not isinstance(decoded.get("recommendations"), list):
            print(f"[ai-advisor] recommendation response malformed: {raw}")
            return RecommendationsResponse(recommendations=[])

        # Same defensive filter as the original PHP engine: the model can
        # still occasionally ignore the prompt's enum constraint, so
        # anything outside the real DB CHECK constraints is dropped here
        # rather than causing a failed insert downstream in Laravel.
        items = []
        for r in decoded["recommendations"]:
            if not all(k in r for k in ("type", "priority", "confidence_score", "summary", "recommendation")):
                continue
            if r["type"] not in VALID_CATEGORIES or r["priority"] not in VALID_PRIORITIES:
                continue
            items.append(RecommendationItem(
                type=r["type"],
                priority=r["priority"],
                confidence_score=float(r["confidence_score"]),
                summary=r["summary"],
                recommendation=r["recommendation"],
            ))

        return RecommendationsResponse(recommendations=items)
    except Exception as e:
        print(f"[ai-advisor] recommendation request exception: {e}")
        return RecommendationsResponse(recommendations=[])


@app.get("/health")
def health():
    return {"status": "ok"}