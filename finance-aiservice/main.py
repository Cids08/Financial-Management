"""
AI Advisor microservice.

Owns everything that talks to the LLM for the advisor chat feature —
prompt construction, the OpenAI Responses-API call (/v1/responses), and
post-processing (em-dash stripping). Laravel's RemoteAdvisorEngine calls this
over HTTP instead of
calling OpenAI directly. Everything else (conversation history,
ownership checks, summarization job scheduling) stays in Laravel, since
those are tightly coupled to the User/database model that has to remain
centralized.

Run alongside the existing forecasting service, on a different port
(8002 here — forecasting is presumably on 8001).
"""

import os
import re
from dataclasses import dataclass
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

OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_REFERER = os.environ.get("OPENAI_REFERER", "")
OPENAI_TITLE = os.environ.get("OPENAI_TITLE", "")
ADVISOR_MODEL = os.environ.get("OPENAI_ADVISOR_MODEL", "gpt-5-mini")
RECOMMENDATION_MODEL = os.environ.get("OPENAI_RECOMMENDATION_MODEL", "gpt-5-mini")
# OpenAI only accepts this on reasoning models (gpt-5 family, o3-*, etc.)
# and rejects it on gpt-4o-mini; the env var is opt-in so either case works.
REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "").strip()
# Responses-API reasoning block mirrors the official gpt-5 snippet:
# standard mode with a summary automatically sized to the response.
REASONING_MODE = os.environ.get("OPENAI_REASONING_MODE", "standard").strip()
REASONING_SUMMARY = os.environ.get("OPENAI_REASONING_SUMMARY", "auto").strip()
# `verbosity` (how expansively the model answers) and `store` (whether the
# request response is saved in the OpenAI dashboard) match the sample call.
VERBOSITY = os.environ.get("OPENAI_VERBOSITY", "medium").strip()
STORE_RESPONSES = os.environ.get("OPENAI_STORE_RESPONSES", "true").strip().lower() in ("1", "true", "yes")

VALID_CATEGORIES = ["Revenue", "Expense", "Cash Flow", "Budget"]
VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"]


def _allows_temperature(model: str) -> bool:
    """OpenAI reasoning models (gpt-5 family, o1/o3/o4-*) only accept the
    default temperature of 1 and reject any other value with HTTP 400."""
    lowered = model.lower()
    return not lowered.startswith(("gpt-5", "o1", "o3", "o4"))


def _build_text_output(json_mode: bool = False) -> dict:
    """Responses-API `text` block. Verbosity only applies to natural-language
    output; structured JSON mode keeps just the json_object format."""
    text = {"format": {"type": "json_object" if json_mode else "text"}}
    if not json_mode:
        text["verbosity"] = VERBOSITY
    return text


def _build_reasoning_block() -> Optional[dict]:
    """Opt-in reasoning config for gpt-5 / o-series models. Mirrors the
    official OpenAI snippet: standard mode with an auto summary at the
    configured effort. Skipped entirely when no effort is set."""
    if not REASONING_EFFORT:
        return None
    return {
        "effort": REASONING_EFFORT,
        "mode": REASONING_MODE,
        "summary": REASONING_SUMMARY,
    }

# Shared secret between Laravel and this service — anyone hitting this
# service directly without it gets rejected. Set the SAME value in both
# this service's .env (INTERNAL_SERVICE_TOKEN) and Laravel's .env
# (AI_ADVISOR_SERVICE_TOKEN), matching how a real internal service
# boundary should authenticate.
INTERNAL_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")


# Every misconfiguration below produced the SAME user-visible string
# ("Sorry, I could not generate a response right now.") while having three
# completely different root causes: a bad internal token (401), the service
# being unreachable (Laravel-side exception), and an upstream OpenRouter
# failure (HTTP 200 with the fallback text). collect_config_problems() turns
# that invisible class of bug into something reportable on /health and in the
# startup log, so a typo in one env var is diagnosable without reading source.
def collect_config_problems() -> List[str]:
    """Returns a list of human-readable configuration problems. Empty == healthy.

    Never raises and never returns early: reports every problem at once so a
    half-configured deploy doesn't have to be fixed one round-trip at a time.
    """
    problems: List[str] = []

    if not INTERNAL_TOKEN:
        problems.append(
            "INTERNAL_SERVICE_TOKEN is empty. Every /reply, /summarize and "
            "/recommendations call will be rejected with 401. This is the exact "
            "bug load_dotenv() above was added to fix, so the env var is most "
            "likely missing from the platform's environment (not just .env)."
        )
    elif len(INTERNAL_TOKEN) < 32:
        # Not a hard failure, but a weak/placeholder secret is worth surfacing.
        problems.append(
            f"INTERNAL_SERVICE_TOKEN is only {len(INTERNAL_TOKEN)} characters; "
            "it should be a long random string."
        )

    if not OPENAI_API_KEY:
        problems.append(
            "OPENAI_API_KEY is empty. Upstream calls will fail with 401 from "
            "OpenRouter. Check the key is actually set and not revoked."
        )

    if not OPENAI_BASE_URL:
        problems.append("OPENAI_BASE_URL is empty; requests would go nowhere.")

    # gpt-5/o-series reject a non-default temperature outright, so a
    # non-reasoning model paired with effort set (or vice versa) is a 400.
    if ADVISOR_MODEL and REASONING_EFFORT and not _allows_temperature(ADVISOR_MODEL):
        problems.append(
            f"OPENAI_REASONING_EFFORT is set to {REASONING_EFFORT!r} but "
            f"OPENAI_ADVISOR_MODEL={ADVISOR_MODEL!r} is a reasoning model. That "
            "combination is valid; this is listed only because it is the most "
            "common reason a deploy differs from local."
        )

    return problems


def log_startup_config() -> None:
    """Prints a one-line config summary plus any problems, at import time.

    Printed rather than raised on purpose: raising here would make the
    container crash-loop, which also takes /health down and leaves nothing to
    query for a diagnosis. Loud logs + a still-responding /health is the more
    debuggable failure mode.
    """
    print(
        f"[ai-advisor] startup: model={ADVISOR_MODEL!r} "
        f"recommendation_model={RECOMMENDATION_MODEL!r} "
        f"base_url={OPENAI_BASE_URL!r} "
        f"reasoning_effort={REASONING_EFFORT or '(unset)'!r} "
        f"verbosity={VERBOSITY!r} store={STORE_RESPONSES} "
        f"token_set={bool(INTERNAL_TOKEN)} token_len={len(INTERNAL_TOKEN)} "
        f"api_key_set={bool(OPENAI_API_KEY)}"
    )
    problems = collect_config_problems()
    if problems:
        print(f"[ai-advisor] CONFIG PROBLEMS ({len(problems)}):")
        for problem in problems:
            print(f"[ai-advisor]   - {problem}")
    else:
        print("[ai-advisor] config OK")


log_startup_config()


def verify_internal_token(x_internal_token: str = Header(default="")):
    # Log the *reason* for a rejection without ever logging the token itself:
    # "missing" and "mismatched" look identical to the caller (both are a bare
    # 401) but have completely different fixes, and the hosted investigation
    # turned on exactly that distinction.
    if not INTERNAL_TOKEN:
        print(
            "[ai-advisor] 401 REJECTED: INTERNAL_SERVICE_TOKEN is empty on this "
            "service, so no caller can ever authenticate. Set it on the platform."
        )
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")
    if x_internal_token != INTERNAL_TOKEN:
        print(
            f"[ai-advisor] 401 REJECTED: token mismatch "
            f"(received {len(x_internal_token)} chars, expected {len(INTERNAL_TOKEN)}). "
            "Laravel's AI_ADVISOR_SERVICE_TOKEN must match INTERNAL_SERVICE_TOKEN exactly."
        )
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")
    return True


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


def strip_echo(text: str, user_message: str) -> str:
    """
    Deterministic backstop for the sibling failure the em-dash strip covers:
    gpt-5 at medium verbosity sometimes OPENS its reply by restating the
    user's latest message verbatim. If the reply's leading content is exactly
    that message, cut it so the answer begins immediately with content.
    """
    needle = " ".join(user_message.split())
    probe = " ".join(text.split())
    if not needle or not probe.startswith(needle) or probe == needle:
        return text

    raw = text.strip()
    pos = 0
    for tok in needle.split():
        at = raw.find(tok + " ", pos)
        if at < 0:
            at = raw.find(tok, pos)
        if at < 0:
            return text
        pos = at + len(tok)
    rest = raw[pos:].lstrip(" ,.:;!?—–\n\t\r")
    return rest or text


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
        "- HARD RULE: never open your reply by repeating, quoting, or paraphrasing the "
        "user's message or question. Start directly with the answer or reaction itself, "
        "as if you were continuing a conversation where their message was already said.\n"
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
        "- HARD RULE, applies whenever the user hands the decision back to you, do this "
        "before anything else: if the user's message is a vague invitation that means 'you "
        "pick', 'you decide', 'suggest something', 'I dunno, tell me', 'you tell me', "
        "'anything?', 'what's important?', 'where do I start?', 'idk', 'ano?', 'ikaw na "
        "bahala', or similar, then YOU lead. Do NOT reply with 'I don't know what you "
        "mean', do NOT ask them 'what would you like to know about', and do NOT just "
        "offer a menu of options for them to pick from. Instead, go to the data below and "
        "pick the ONE most important thing on their plate right now (the highest-priority "
        "or risk alert recommendation, or the biggest movement in a forecast), then just "
        "tell them that, concretely, in one or two sentences with the key figure bolded. "
        "End by offering to go deeper on that same thing. Being decisive here is the whole "
        "point, the user handed you the floor because they want your judgment, not a "
        "question thrown back at them.\n"
        "- If the user's message is unclear, garbled, a single stray word, or you genuinely "
        "can't tell what they mean (e.g. 'Admin', random characters, an incomplete sentence), "
        "do NOT invent a joke or unrelated content. Just say briefly that you're not sure you "
        "followed that, then offer 1-2 concrete questions they could ask instead, based on the "
        "data below. Keep this light and short, not a formal fallback message.\n\n"
        "Avoiding repetition:\n"
        "- Check the recent messages below before you answer. If you already gave this same "
        "recommendation or figure earlier in the conversation, don't restate it near-verbatim. "
        "the user will notice and it reads like a glitch.\n"
        "- HARD RULE: this covers your own filler and deflection lines too, not just the "
        "numbers. Once you have said a line like 'I don't have that in the data you gave', "
        "'I can't tell you which model is running', 'same as before', or 'let me know what "
        "you'd like to look at', NEVER reuse that sentence or its skeleton later, and never "
        "attach it to a different question just because the wording fits. Those lines are "
        "conversation-specific and expire the moment you use them. A recurring 'I don't "
        "have that' no matter what the user asks is the single worst thing you can do here, "
        "it makes the user think you're only replaying an old answer instead of reading "
        "their message. Every reply must be written fresh against their latest message.\n"
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
        "If the user asks who or what you are:\n"
        "- Answer identity questions directly and in one short sentence. Do not pretend the "
        "question is about company data, and do not answer it in the shape of a data "
        "refusal like 'I don't have that in the data you gave'. The data below contains no "
        "information about you, and saying so reads as a glitch.\n"
        "- Stay non-technical and do not name, confirm, or deny any specific underlying "
        "model or vendor. If pressed on which model is running, or whether you are a "
        "particular model, say plainly that you're Alibaton Construction's financial "
        "assistant and don't go further. That's the whole answer, don't append a "
        "capability list or offer to walk through forecasts after it.\n"
        "- Answer it ONCE and move on. Identity is not a recurring topic, and you must never "
        "bring it up again in a later reply on an unrelated question.\n\n"
        "Content rules:\n"
        "- Only use the data provided below, whether it's a forecast, recommendation, or any "
        "other transaction record. Never invent figures for a category that isn't in the data "
        "below, even if it sounds like something the system would track. If the user asks about "
        "a transaction type with no data below, say plainly that you don't have that data right "
        "now instead of guessing.\n"
        "- When you have no relevant data, briefly state what you actually have on file (e.g. "
        "'I don't have any risk alerts or recommendations right now') and offer what you CAN "
        "help with instead. NEVER ask the user to paste data, upload files, or 'grant access' "
        "as a workaround - this chat can't ingest anything they'd paste, and that canned line "
        "makes you look broken. Just answer from the data you were given.\n"
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


@dataclass
class CompletionResult:
    """Outcome of one upstream call, including *why* it failed.

    Previously complete_responses() returned Optional[str] and every failure
    mode collapsed to None, which the endpoints then turned into the same
    fallback sentence. Carrying an explicit reason here is what makes an
    upstream outage distinguishable from a bad request.
    """

    text: Optional[str] = None
    # Short stable slug: missing_api_key, upstream_4xx, upstream_5xx,
    # timeout, network_error, empty_output, malformed_output
    reason: Optional[str] = None
    status: Optional[int] = None
    # Truncated upstream body, for the log. Never the API key.
    detail: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.text is not None

    def describe(self) -> str:
        bits = [f"reason={self.reason or 'unknown'}"]
        if self.status is not None:
            bits.append(f"status={self.status}")
        if self.detail:
            bits.append(f"detail={self.detail}")
        return " ".join(bits)


def _truncate(text: str, limit: int = 500) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[:limit] + "...[truncated]"


async def complete_responses(
    model: str,
    instructions: str,
    input_messages: list,
    max_tokens: int,
    temperature: float = 1.0,
    json_mode: bool = False,
) -> CompletionResult:
    """One OpenAI Responses-API call (/v1/responses) using the same shape as
    the official gpt-5-mini snippet: text.format + verbosity, opt-in reasoning
    {effort, mode, summary}, and store. Laravel always gets a single JSON
    reply from this service, so there's no client to stream to, hence the
    snippet's `stream`/`include` args are omitted here (the reasoning output
    budget they'd surface is still accounted for via max_output_tokens)."""
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    if OPENAI_REFERER:
        headers["HTTP-Referer"] = OPENAI_REFERER
    if OPENAI_TITLE:
        headers["X-Title"] = OPENAI_TITLE
    body = {
        "model": model,
        "input": input_messages,
        "max_output_tokens": max_tokens,
        "text": _build_text_output(json_mode=json_mode),
        "store": STORE_RESPONSES,
    }
    if instructions:
        body["instructions"] = instructions
    if _allows_temperature(model):
        body["temperature"] = temperature
    reasoning = _build_reasoning_block()
    if reasoning:
        body["reasoning"] = reasoning

    if not OPENAI_API_KEY:
        return CompletionResult(
            reason="missing_api_key",
            detail="OPENAI_API_KEY is empty on this service.",
        )

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{OPENAI_BASE_URL}/responses", json=body, headers=headers)

        if response.status_code >= 400:
            # Split 401 (credential/config) from 5xx (provider outage) from
            # 400 (malformed request) because the first is a deployment bug
            # and the others are not.
            if response.status_code == 401:
                reason = "upstream_401"
            elif response.status_code == 400:
                reason = "upstream_400_bad_request"
            elif response.status_code >= 500:
                reason = "upstream_5xx"
            else:
                reason = f"upstream_{response.status_code}"
            print(
                f"[ai-advisor] OpenAI request failed: {response.status_code} "
                f"model={model} {reason} body={_truncate(response.text)}"
            )
            return CompletionResult(reason=reason, status=response.status_code,
                                    detail=_truncate(response.text))

        data = response.json()
        # Prefer the top-level output_text convenience field, but fall back
        # to walking the output items: when a reasoning item precedes the
        # final message, output_text can come back None even for a completed
        # response, leaving only message.content[].text rows to read.
        content = data.get("output_text")
        if content is None:
            parts = []
            for item in data.get("output", []):
                if item.get("type") != "message":
                    continue
                for block in item.get("content", []):
                    if block.get("type") in ("output_text", "text"):
                        parts.append(block.get("text", ""))
            content = "".join(parts) or None
        if content is None:
            # Completed but nothing readable: usually max_output_tokens fully
            # consumed by reasoning, which is a token-budget problem, not a
            # transport one. Log the incomplete/incomplete_details signal.
            incomplete = data.get("incomplete_details") or data.get("status") or "unknown"
            print(
                f"[ai-advisor] upstream returned no readable text: model={model} "
                f"status={data.get('status')} incomplete={incomplete} "
                f"output_types={[i.get('type') for i in data.get('output', [])]}"
            )
            return CompletionResult(reason="empty_output", status=response.status_code,
                                    detail=f"status={data.get('status')} incomplete={incomplete}")
        # Never rewrite structured JSON (recommendations) — only prose replies
        # get the em-dash backstop so the JSON shape is never corrupted.
        return CompletionResult(
            text=content if json_mode else strip_em_dashes(content)
        )
    except httpx.TimeoutException as e:
        print(f"[ai-advisor] OpenAI request timed out after 60s: {e}")
        return CompletionResult(reason="timeout", detail=str(e))
    except Exception as e:
        print(f"[ai-advisor] OpenAI request exception: {type(e).__name__}: {e}")
        return CompletionResult(reason="network_error", detail=f"{type(e).__name__}: {e}")


@app.post("/reply", response_model=ReplyResponse, dependencies=[])
async def reply(req: ReplyRequest, x_internal_token: str = Header(default="")):
    verify_internal_token(x_internal_token)

    instructions = build_system_prompt(req.summary, req.grounding_data)
    input_messages = [{"role": m.role, "content": m.content} for m in req.recent_messages]
    input_messages.append({"role": "user", "content": req.message})

    # gpt-5-mini consumes its output budget on reasoning even at 'low' effort;
    # at 'medium' a measured call burned ~1700 of 4096 tokens just to answer a
    # short question over the large advisor system prompt. Keep a generous cap.
    result = await complete_responses(
        ADVISOR_MODEL,
        instructions,
        input_messages,
        max_tokens=3000,
        temperature=0.4,
    )
    if not result.ok:
        # Return 502 rather than a 200 carrying the fallback sentence. The
        # chat shows the same sentence either way (RemoteAdvisorEngine falls
        # back to it on any non-2xx), but a 502 makes Laravel's
        # `$response->failed()` branch fire, so the failure is recorded in
        # laravel.log too instead of existing only in this service's stdout.
        print(f"[ai-advisor] /reply upstream failure: {result.describe()}")
        raise HTTPException(
            status_code=502,
            detail=f"Upstream completion failed ({result.reason}).",
        )
    reply_text = strip_echo(result.text, req.message)
    return ReplyResponse(reply=reply_text)


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, x_internal_token: str = Header(default="")):
    verify_internal_token(x_internal_token)

    result = await complete_responses(
        ADVISOR_MODEL,
        (
            "Summarize this financial-advisor chat in 3-4 factual sentences, "
            "preserving any figures, recommendations, or decisions mentioned. "
            "Do not add new information. Plain text, no markdown."
        ),
        [{"role": "user", "content": req.transcript}],
        max_tokens=800,
        temperature=0,
    )
    if not result.ok:
        # Summarization is a background nicety, not the user's request, so this
        # degrades to None (no summary) rather than failing the caller.
        print(f"[ai-advisor] /summarize upstream failure: {result.describe()}")
        return SummarizeResponse(summary=None)
    return SummarizeResponse(summary=result.text)


def build_recommendation_system_prompt() -> str:
    """Ported verbatim from OpenAiRecommendationEngine::systemPrompt()."""
    return (
        "You are a financial analysis assistant for Alibaton Construction Inc.'s "
        "Financial Management System. You will be given a single ARIMA forecast result as "
        "JSON. Generate recommendations based ONLY on the figures given - never invent "
        "or estimate numbers not provided. Return at most ONE recommendation per category; "
        "never output two entries for the same category - if you have several insights for one "
        "category, fold them into a single combined recommendation. Different categories may "
        "each get their own recommendation. Always communicate forecast uncertainty honestly; "
        "never present the forecast as guaranteed. Avoid definitive financial advice "
        "(e.g. never say 'you should invest more') - explain why, highlight supporting data, "
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

    raw = await complete_responses(
        RECOMMENDATION_MODEL,
        build_recommendation_system_prompt(),
        # json_object format requires the word "json" to appear in the
        # INPUT messages (instructions don't count) or OpenAI rejects the
        # request with a 400.
        [{"role": "user", "content": f"Forecast result in JSON:\n{_json.dumps(payload)}"}],
        max_tokens=1500,
        temperature=0.2,
        json_mode=True,
    )
    if not raw.ok:
        # Empty list keeps the forecast pipeline working (a forecast with no
        # recommendations is valid), but the reason is logged so a silent
        # "the AI never produced anything" is distinguishable from "the model
        # legitimately returned nothing".
        print(f"[ai-advisor] /recommendations upstream failure: {raw.describe()}")
        return RecommendationsResponse(recommendations=[])

    try:
        decoded = _json.loads(raw.text)
    except _json.JSONDecodeError:
        print(f"[ai-advisor] recommendation response malformed: {_truncate(raw.text)}")
        return RecommendationsResponse(recommendations=[])

    if not isinstance(decoded, dict) or not isinstance(decoded.get("recommendations"), list):
        print(f"[ai-advisor] recommendation response malformed: {_truncate(raw.text)}")
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

    # One recommendation per category: if the model returned several
    # entries for the same category, keep only the single most
    # confident one so each forecast ends up with at most one row per
    # category downstream in Laravel. Different categories stay
    # separate.
    seen: dict[str, RecommendationItem] = {}
    for r in items:
        existing = seen.get(r.type)
        if existing is None or r.confidence_score > existing.confidence_score:
            seen[r.type] = r
    items = list(seen.values())

    return RecommendationsResponse(recommendations=items)


@app.get("/health")
def health():
    """Liveness plus a config report.

    Reports the resolved configuration because this endpoint is the only one
    reachable without the internal token, and a misconfigured deploy (empty
    INTERNAL_SERVICE_TOKEN, missing key) is otherwise indistinguishable from a
    healthy one that merely can't reach OpenRouter. Secrets are reported as
    booleans/lengths only, never values.
    """
    problems = collect_config_problems()
    return {
        "status": "ok" if not problems else "degraded",
        "config": {
            "advisor_model": ADVISOR_MODEL,
            "recommendation_model": RECOMMENDATION_MODEL,
            "base_url": OPENAI_BASE_URL,
            "reasoning_effort": REASONING_EFFORT or None,
            "reasoning_mode": REASONING_MODE,
            "reasoning_summary": REASONING_SUMMARY,
            "verbosity": VERBOSITY,
            "store_responses": STORE_RESPONSES,
            "internal_token_set": bool(INTERNAL_TOKEN),
            "internal_token_length": len(INTERNAL_TOKEN),
            "api_key_set": bool(OPENAI_API_KEY),
        },
        "problems": problems,
    }