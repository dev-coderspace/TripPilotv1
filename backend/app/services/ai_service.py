"""
TripPilot AI Service — powered by Google Gemini
All AI calls go through this module.
"""
import asyncio
import json
import random
import re
import httpx
from app.core.config import settings

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
_AVAILABLE_MODELS_CACHE: list[str] = []


async def _get_supported_models(api_key: str) -> list[str]:
    """Query Google AI's ListModels API to get exact supported generateContent models for this key."""
    global _AVAILABLE_MODELS_CACHE
    if _AVAILABLE_MODELS_CACHE:
        return _AVAILABLE_MODELS_CACHE

    discovered = []
    for base in ["https://generativelanguage.googleapis.com/v1beta", "https://generativelanguage.googleapis.com/v1"]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(f"{base}/models?key={api_key}")
                if res.status_code == 200:
                    models = res.json().get("models") or []
                    for m in models:
                        name = m.get("name", "")
                        methods = m.get("supportedGenerationMethods") or []
                        if "generateContent" in methods and ("flash" in name or "pro" in name or "gemini" in name):
                            if name not in discovered:
                                discovered.append(name)
        except Exception:
            pass

    if discovered:
        # Prioritize flash models, then pro models
        discovered.sort(key=lambda x: (0 if "flash" in x else 1, x))
        _AVAILABLE_MODELS_CACHE = discovered
        return discovered

    return ["models/gemini-3.8-flash", "models/gemini-2.5-flash", "models/gemini-1.5-flash", "models/gemini-1.5-pro", "models/gemini-2.0-flash-exp"]


async def _call_gemini(prompt: str, temperature: float = 0.3) -> str:
    """Gemini API call using official google.generativeai SDK with REST HTTP fallback."""
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set or empty in backend environment variables (.env file).")

    # 1. Try official google.generativeai SDK first
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        sdk_models = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.0-pro"]
        sdk_errors = []

        for model_name in sdk_models:
            try:
                model = genai.GenerativeModel(
                    model_name=model_name,
                    generation_config=genai.GenerationConfig(
                        temperature=temperature,
                        max_output_tokens=8192,
                    ),
                )
                res = model.generate_content(prompt)
                if res and res.text:
                    return res.text
            except Exception as e:
                err_str = str(e)
                if any(k in err_str.lower() for k in ["quota", "429", "resource_exhausted"]):
                    raise RuntimeError(f"Gemini API Quota Exceeded (HTTP 429): {err_str}")
                if any(k in err_str.lower() for k in ["invalid", "key", "400", "403", "unauthorized"]):
                    raise RuntimeError(f"Gemini API Key Error: {err_str}")
                sdk_errors.append(f"[{model_name}] {err_str}")
    except RuntimeError:
        raise
    except Exception as sdk_err:
        print(f"SDK call failed, trying REST fallback: {sdk_err}")

    # 2. REST HTTP Fallback
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": api_key,
    }
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 8192,
        },
    }

    target_models = await _get_supported_models(api_key)
    errors = []

    for model_path in target_models:
        full_model = model_path if model_path.startswith("models/") else f"models/{model_path}"
        url = f"{GEMINI_BASE}/{full_model}:generateContent?key={api_key}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.post(url, headers=headers, json=body)

            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    raise RuntimeError(f"Gemini returned no candidates (promptFeedback={data.get('promptFeedback')})")

                cand = candidates[0]
                parts = (cand.get("content") or {}).get("parts") or []
                texts = [p["text"] for p in parts if isinstance(p, dict) and "text" in p]
                if not texts:
                    raise RuntimeError(f"Gemini returned no text (finishReason={cand.get('finishReason')})")
                return "".join(texts)

            err_detail = f"HTTP {resp.status_code}: {resp.text[:300]}"
            errors.append(f"[{full_model}] {err_detail}")

            if resp.status_code == 429:
                raise RuntimeError(f"Gemini API Quota Exceeded (HTTP 429): {resp.text[:300]}")
            if resp.status_code in (400, 403):
                raise RuntimeError(f"Gemini API Key Error ({resp.status_code}): {resp.text[:300]}")
        except Exception as e:
            if any(err_kw in str(e) for err_kw in ["Quota", "429", "400", "403", "not set"]):
                raise e

    raise RuntimeError(f"Gemini API call failed across models. Tried: {target_models}. Errors: {'; '.join(errors)}")


def repair_truncated_json(s: str) -> str:
    """Zero-dependency robust utility to repair and close truncated JSON blocks."""
    s = s.strip()
    if not s:
        return "{}"
    s = re.sub(r"^```(?:json)?", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"```$", "", s).strip()
    
    stack = []
    in_string = False
    escape = False
    repaired_chars = []
    
    for char in s:
        if escape:
            repaired_chars.append(char)
            escape = False
            continue
        if char == '\\' and in_string:
            repaired_chars.append(char)
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            repaired_chars.append(char)
            continue
        if in_string:
            repaired_chars.append(char)
            continue
        if char in ('{', '['):
            stack.append(char)
        elif char == '}':
            if stack and stack[-1] == '{':
                stack.pop()
        elif char == ']':
            if stack and stack[-1] == '[':
                stack.pop()
        repaired_chars.append(char)
        
    repaired = "".join(repaired_chars)
    if in_string:
        repaired += '"'
    while stack:
        top = stack.pop()
        if top == '{':
            repaired = repaired.rstrip(" \t\n\r,:")
            repaired += "}"
        elif top == '[':
            repaired = repaired.rstrip(" \t\n\r,")
            repaired += "]"
    return repaired


def _extract_json(text: str) -> dict | list:
    """Extract JSON block from Gemini response (handles markdown fences and truncation)."""
    text_clean = text.strip()
    # Try ```json ... ``` block first
    match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text_clean)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            try:
                return json.loads(repair_truncated_json(match.group(1).strip()))
            except Exception:
                pass
                
    # Fallback: try entire response as JSON
    try:
        return json.loads(text_clean)
    except json.JSONDecodeError:
        return json.loads(repair_truncated_json(text_clean))


# ─── Real Image Resolution via Google Places API (New) ────────────────────────
# Google closed the Custom Search JSON API to new customers (full shutdown
# Jan 1, 2027), so images are resolved through Places API (New) instead:
# Text Search matches the hotel/attraction, Place Photos returns a real photo
# of that exact place from Google Maps.

# Generic, neutral fallbacks used ONLY when search is unconfigured/fails/empty.
# These are deliberately non-place-specific so they never mislabel a location.
_FALLBACK_COVER = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80"
_FALLBACK_HOTEL = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"
_FALLBACK_PLACE = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80"

# In-memory cache so the same query (e.g. a popular landmark) is fetched once.
_IMAGE_CACHE: dict[str, str] = {}

# Set when the API key/project is misconfigured (e.g. Places API not enabled
# or billing missing). All further lookups short-circuit until the server
# restarts, so we log the actionable error once instead of once per hotel/place.
_SEARCH_CONFIG_ERROR: str | None = None

_PLACES_BASE = "https://places.googleapis.com/v1"


async def fetch_image_url(query: str, *, bypass_cache: bool = False, exclude_url: str | None = None) -> str | None:
    """Resolve a free-text phrase ("The Himalayan hotel Manali", "Solang Valley
    Manali") to a REAL photo of that exact place via Google Places API (New):

      1. POST /places:searchText → best-matching place with its photo references
      2. GET  /{photo}/media?skipHttpRedirect=true → stable googleusercontent
         photo URL (hotlinkable, no API key embedded in the stored URL)

    Photos come from Google Maps, so hotels/attractions get pictures of the
    actual property/site. Returns None if unconfigured, no match, no photos,
    or on error — the caller then uses a generic fallback. Cached in-memory
    (skip the cache with bypass_cache=True, e.g. for an explicit "regenerate").

    A place on Google Maps usually has several photos, not just one — when
    `exclude_url` is given (the photo currently shown), candidates are tried
    in random order and the first one that DOESN'T match it is returned, so
    "regenerate" actually surfaces a different shot instead of the same photo
    every time.
    """
    global _SEARCH_CONFIG_ERROR
    if not query or not query.strip():
        return None
    key = query.strip().lower()
    if not bypass_cache and key in _IMAGE_CACHE:
        return _IMAGE_CACHE[key]

    api_key = settings.GOOGLE_PLACES_API_KEY or settings.GOOGLE_SEARCH_API_KEY
    if not api_key:
        return None  # not configured → caller uses a generic fallback
    if _SEARCH_CONFIG_ERROR:
        return None  # known-broken config; already logged with fix instructions

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            search = await client.post(
                f"{_PLACES_BASE}/places:searchText",
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": api_key,
                    # Field mask kept minimal — it determines the billing SKU.
                    "X-Goog-FieldMask": "places.photos",
                },
                json={"textQuery": query, "pageSize": 1},
            )
            if search.status_code != 200:
                body = search.text[:300]
                if search.status_code in (401, 403):
                    _SEARCH_CONFIG_ERROR = body
                    print(
                        "Google Places image lookup is DISABLED — all itinerary images "
                        f"will use generic fallbacks. API said: {body}\n"
                        "FIX: use a Google Cloud API key (starts with 'AIza') and enable "
                        "'Places API (New)' + billing for its project at "
                        "https://console.cloud.google.com/apis/library/places.googleapis.com"
                    )
                else:
                    print(f"Places text search failed ({search.status_code}) for '{query}': {body}")
                return None

            places = search.json().get("places") or []
            photos = list((places[0].get("photos") or []) if places else [])
            if not photos:
                return None  # no Maps photos for this place → generic fallback

            random.shuffle(photos)
            fallback_link: str | None = None
            for photo in photos[:6]:  # cap media calls per lookup
                photo_name = photo.get("name")
                if not photo_name:
                    continue
                media = await client.get(
                    f"{_PLACES_BASE}/{photo_name}/media",
                    params={"maxWidthPx": 1600, "skipHttpRedirect": "true", "key": api_key},
                )
                if media.status_code != 200:
                    continue
                link = (media.json() or {}).get("photoUri")
                if not link:
                    continue
                if fallback_link is None:
                    fallback_link = link
                if not exclude_url or link != exclude_url:
                    if not bypass_cache:
                        _IMAGE_CACHE[key] = link
                    return link

            # Every candidate matched exclude_url (or only one photo exists) —
            # this place genuinely only has that one Maps photo available.
            if fallback_link and not bypass_cache:
                _IMAGE_CACHE[key] = fallback_link
            return fallback_link
    except Exception as e:
        print(f"Places image lookup error for '{query}': {e}")
        return None


async def resolve_itinerary_images(data: dict, force: bool = True) -> dict:
    """Replace placeholder/empty image URLs with REAL photos fetched by name.

    For the cover, each hotel and each sightseeing place we build a precise
    search phrase (preferring an AI-supplied `image_query`, else name + city +
    destination) and fetch a matching photo concurrently.

    force=True  → overwrite every image (used on fresh generation; the AI's
                  own image_url values are unreliable/hallucinated).
    force=False → keep existing real http(s) URLs, only fill in empty/placeholder
                  ones (used on chat-edit so we don't re-query unchanged items).
    """
    if not isinstance(data, dict):
        return data

    destination = (data.get("destination") or "").strip()

    def needs(current: str) -> bool:
        if force:
            return True
        if not current or not isinstance(current, str):
            return True
        return (not current.startswith("http")) or ("loremflickr" in current)

    # Each target: (container_dict, key, search_query, fallback_url)
    targets: list[tuple[dict, str, str, str]] = []

    # Cover
    if needs(data.get("cover_image_url")):
        cover_q = (data.get("cover_image_query")
                   or (f"{destination} iconic landmark scenery" if destination else (data.get("cover_title") or data.get("title") or "")))
        targets.append((data, "cover_image_url", cover_q, _FALLBACK_COVER))

    # Hotels
    for s in (data.get("stay_options") or []):
        if isinstance(s, dict) and needs(s.get("image_url")):
            q = s.get("image_query") or " ".join(
                x for x in [s.get("hotel_name"), (s.get("city") or destination), "hotel"] if x
            )
            targets.append((s, "image_url", q, _FALLBACK_HOTEL))

    # Sightseeing places
    for day in (data.get("days") or []):
        if isinstance(day, dict):
            city = day.get("city") or destination
            for p in (day.get("places") or []):
                if isinstance(p, dict) and needs(p.get("image_url")):
                    q = p.get("image_query") or " ".join(
                        x for x in [p.get("name"), city] if x
                    )
                    targets.append((p, "image_url", q, _FALLBACK_PLACE))

    if not targets:
        return data

    results = await asyncio.gather(
        *[fetch_image_url(q) for (_, _, q, _f) in targets],
        return_exceptions=True,
    )

    for (container, field, _q, fallback), res in zip(targets, results):
        url = res if isinstance(res, str) and res else fallback
        container[field] = url

    return data


# ─── Lead Parsing ─────────────────────────────────────────────────────────────

async def parse_lead_from_text(raw_text: str) -> dict:
    """
    Parse a free-form WhatsApp/email message into a structured Lead dict.
    Returns keys: name, phone, email, destination, trip_type, num_travellers,
                  num_adults, num_children, num_infants, budget, travel_date, notes, source
    """
    prompt = f"""You are a travel CRM data extraction assistant.

Extract lead information from the following message and return a valid JSON object with these exact keys:
- name (string, required — first name + last name if available)
- phone (string, 9-13 digits, required — use "0000000000" if not found)
- email (string or null)
- destination (string or null — city/country they want to visit)
- trip_type (string or null — e.g. "Honeymoon", "Family", "Corporate", "Adventure")
- num_travellers (integer or null — total number of travellers)
- num_adults (integer or null — number of adults)
- num_children (integer or null — number of children)
- num_infants (integer or null — number of infants)
- budget (string or null — e.g. "₹50,000", "1 lakh")
- travel_date (string or null — ISO date YYYY-MM-DD if found, else null)
- notes (string — full original message as notes)
- source (one of: whatsapp, instagram, website, referral, advertisement, manual, email)

Message:
\"\"\"{raw_text}\"\"\"

Respond ONLY with a JSON object. No explanation."""

    try:
        text = await _call_gemini(prompt, temperature=0.1)
        return _extract_json(text)
    except Exception as e:
        print(f"Gemini Lead Parsing failed, executing rules-based fallback: {e}")
        # Rules-based regex parser fallback for extra resilience if Gemini is offline
        parsed = {
            "name": "Unknown",
            "phone": "0000000000",
            "email": None,
            "destination": None,
            "trip_type": None,
            "num_travellers": None,
            "num_adults": None,
            "num_children": None,
            "num_infants": None,
            "budget": None,
            "travel_date": None,
            "notes": raw_text,
            "source": "manual",
        }
        
        # 1. Try to extract phone (9 to 13 digits)
        phone_match = re.search(r'\b(?:\+?\d{1,3}[- ]?)?(\d{9,13})\b', raw_text)
        if phone_match:
            parsed["phone"] = phone_match.group(1)
            
        # 2. Try to extract email
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', raw_text)
        if email_match:
            parsed["email"] = email_match.group(0)
            
        # 3. Try to extract a potential name
        words = raw_text.split()
        if words:
            first_word = words[0].strip(" ,.-!?")
            if first_word.lower() not in ["hi", "hello", "dear", "need", "want", "looking", "trip"]:
                parsed["name"] = first_word
            elif len(words) > 1:
                second_word = words[1].strip(" ,.-!?")
                if second_word.lower() not in ["need", "want", "looking", "trip"]:
                    parsed["name"] = second_word
                    
        # 4. Try to parse budget
        budget_match = re.search(r'\b(\d+(?:\s*(?:lakh|lakhs|lak|laks|k|thousand))|\d+,\d+(?:,\d+)?|\b\d+\s*(?:usd|sgd|inr|rs|rupees))\b', raw_text, re.IGNORECASE)
        if budget_match:
            parsed["budget"] = budget_match.group(1)
        elif "budget" in raw_text.lower():
            budget_near = re.search(r'budget\s*(?:of|is|:)?\s*([^,.\n]+)', raw_text, re.IGNORECASE)
            if budget_near:
                parsed["budget"] = budget_near.group(1).strip()
                
        # 5. Try to extract destinations
        destinations = ["paris", "maldives", "bali", "singapore", "goa", "manali", "kashmir", "europe", "switzerland", "london", "dubai", "thailand", "vietnam"]
        for d in destinations:
            if re.search(rf'\b{d}\b', raw_text, re.IGNORECASE):
                parsed["destination"] = d.capitalize()
                break
                
        # 6. Try to guess number of travellers
        adult_match = re.search(r'(\d+)\s*(?:adult|adults)', raw_text, re.IGNORECASE)
        kid_match = re.search(r'(\d+)\s*(?:kid|kids|child|children)', raw_text, re.IGNORECASE)
        infant_match = re.search(r'(\d+)\s*(?:infant|infants|baby|babies)', raw_text, re.IGNORECASE)
        
        num_travellers = 0
        if adult_match:
            parsed["num_adults"] = int(adult_match.group(1))
            num_travellers += parsed["num_adults"]
        if kid_match:
            parsed["num_children"] = int(kid_match.group(1))
            num_travellers += parsed["num_children"]
        if infant_match:
            parsed["num_infants"] = int(infant_match.group(1))
            num_travellers += parsed["num_infants"]
            
        if num_travellers > 0:
            parsed["num_travellers"] = num_travellers
            
        # 7. Try to guess trip type
        trip_types = ["honeymoon", "family", "corporate", "adventure", "friends", "solo"]
        for t in trip_types:
            if re.search(rf'\b{t}\b', raw_text, re.IGNORECASE):
                parsed["trip_type"] = t.capitalize()
                break
                
        return parsed


# ─── Itinerary Generation ─────────────────────────────────────────────────────

async def generate_itinerary(raw_text: str, layout: str = "visual_experience") -> dict:
    """
    Generate a fully structured itinerary JSON from raw text input.
    Returns a dict matching the Itinerary model schema.
    """
    prompt = f"""You are an expert travel itinerary planner for a travel agency CRM.

Generate a complete, detailed travel itinerary from the following description.
Return a valid JSON object with these exact keys:

{{
  "title": "Trip Title",
  "cover_image_query": "Precise photo search phrase for the destination's most iconic view",
  "cover_title": "Cover Title",
  "cover_subheading": "Cover Subheading",
  "num_travellers": null,
  "total_days": 3,
  "total_nights": 2,
  "destination": "Primary Destination",
  "package_cost": "Total package cost as a plain number string (e.g. \"80000\"), only if a budget/cost was mentioned in the trip description, else null",
  "per_person_cost": "Per-person cost as a plain number string, only if derivable from a mentioned budget and traveller count, else null",
  "inclusions": "One inclusion per line (e.g. hotel stays, transfers, meals, sightseeing as per itinerary) \\n-separated, based on what's actually in this itinerary",
  "exclusions": "One exclusion per line (standard travel exclusions: airfare unless specified, personal expenses, tips, camera fees, anything not explicitly included) \\n-separated",
  "meals_summary": {{
    "breakfast": 0,
    "lunch": 0,
    "dinner": 0
  }},
  "flights": {{
    "onward": {{
      "from": "City",
      "to": "City",
      "airline": "Airline name or null",
      "date": "YYYY-MM-DD or null",
      "departure_time": "HH:MM or null",
      "arrival_time": "HH:MM or null",
      "duration": "Duration or null",
      "baggage": "Baggage or null"
    }},
    "return": {{
      "from": "City",
      "to": "City",
      "airline": "Airline name or null",
      "date": "YYYY-MM-DD or null",
      "departure_time": "HH:MM or null",
      "arrival_time": "HH:MM or null",
      "duration": "Duration or null",
      "baggage": "Baggage or null"
    }}
  }},
  "stay_options": [
    {{
      "option": "OPTION 1",
      "hotel_name": "Hotel Name",
      "image_query": "Hotel Name City exterior",
      "google_rating": "4.5",
      "directions_url": "Google Maps Link",
      "city": "City Name",
      "nights": 2,
      "room_category": "Room Category",
      "meal_plan": "Meal Plan",
      "total_cost": "Estimated total cost in INR or null"
    }}
  ],
  "days": [
    {{
      "day": 1,
      "city": "City Name",
      "summary": "Day Summary",
      "date": null,
      "places": [
        {{
          "name": "Sightseeing Place Name",
          "description": "Engaging description of sightseeing place.",
          "image_query": "Precise photo search phrase incl. place name + city/region"
        }}
      ],
      "activities": [
        "Minor activity or bullet point 1",
        "Minor activity or bullet point 2"
      ],
      "meals": {{
        "breakfast": true,
        "lunch": false,
        "dinner": true
      }},
      "tour_type": "SIC or Private"
    }}
  ]
}}

INSTRUCTIONS:
1. DO NOT output any image URLs. Instead, output `image_query` fields — short, precise photo SEARCH PHRASES. Our system resolves each query to a real photo. Never invent or guess image URLs.
2. `cover_image_query`: the destination's most iconic, recognisable view (e.g. "Manali snow mountains Himachal Pradesh", "Eiffel Tower Paris at sunset").
3. For each hotel: `image_query` = hotel name + city (e.g. "The Himalayan hotel Manali exterior").
4. For each sightseeing place: `image_query` MUST uniquely identify THAT exact place — include the place name plus its city/region so the photo is correct (e.g. "Hadimba Devi Temple Manali", "Solang Valley Manali paragliding", "Mall Road Manali market"). A vague query like just "temple" is NOT acceptable.
5. `places`: Inside each day, you MUST populate at least 2 or 3 sightseeing places, each with `name`, `description`, and a precise `image_query`. Do NOT leave places empty.
6. `activities`: Keep this as a simple list of minor extra activities or notes for the day (e.g. transfer details, check-in, free evening).
7. `directions_url`: Always generate a valid Google Maps search URL for the hotel, like 'https://maps.google.com/?q=Hotel+Name+City'.
8. `google_rating`: Assign a realistic star rating like '4.2' or '4.5' based on the hotel's class.
9. `meal_plan`: Use standard travel meal plan terms (e.g. 'Breakfast Included', 'Breakfast & Dinner', 'Room Only').
10. `package_cost` / `per_person_cost`: ONLY populate these if the trip description mentions a budget or cost figure — convert it to a plain digit string (e.g. "₹80,000" → "80000"). If no budget is mentioned, leave both null. Never invent a price.
11. `inclusions` / `exclusions`: ALWAYS populate both, one item per line, tailored to what's actually in this itinerary (hotels, transfers, meals, sightseeing entries included; typically airfare, personal expenses, tips, camera fees excluded unless stated otherwise).

12. CONCISENESS: All daily summaries, sightseeing descriptions, and cover descriptions MUST be extremely brief (max 15-20 words). Keep daily activities lists to a maximum of 3 short items. This is critical to prevent response truncation!

Trip description:
\"\"\"{raw_text}\"\"\"

Respond ONLY with a JSON object. No explanation."""

    try:
        text = await _call_gemini(prompt, temperature=0.6)
        data = _extract_json(text)
        # Compute total_days from days array if not provided
        if "days" in data and isinstance(data["days"], list):
            data["total_days"] = data.get("total_days") or len(data["days"])
            data["total_nights"] = data.get("total_nights") or max(0, len(data["days"]) - 1)
        # Resolve every place/hotel/cover to a REAL photo by its search query.
        return await resolve_itinerary_images(data, force=True)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("GEMINI ITINERARY GENERATION FAILED:", str(e))
        return {"title": "New Itinerary", "days": [], "total_days": 0, "total_nights": 0, "error": str(e)}


# ─── Hotel Voucher Parsing ────────────────────────────────────────────────────

async def parse_hotel_voucher(description: str) -> dict:
    """
    Parse a hotel booking description into a structured voucher dict.
    """
    prompt = f"""You are a hotel booking assistant for a travel agency.

Extract hotel booking details from the description below and return a valid JSON:
{{
  "hotel_name": "string",
  "hotel_stars": integer (1-5) or null,
  "hotel_address": "string or null",
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "room_type": "string or null",
  "num_rooms": integer or null,
  "num_guests": integer or null,
  "meal_plan": "string (e.g. Breakfast Included, All Inclusive) or null",
  "cancellation_policy": "string or null",
  "special_requests": "string or null"
}}

Booking description:
\"\"\"{description}\"\"\"

Respond ONLY with a JSON object."""

    try:
        text = await _call_gemini(prompt, temperature=0.1)
        return _extract_json(text)
    except Exception as e:
        print(f"Error in hotel voucher parsing: {e}")
        return {"hotel_name": "Unknown Hotel"}


# ─── Chat Edit ────────────────────────────────────────────────────────────────

async def edit_itinerary_with_chat(current_itinerary: dict, command: str) -> dict:
    """
    Apply a natural language edit command to an existing itinerary.
    e.g. "Add a cooking class on Day 2", "Change hotel on Day 3 to Hilton"
    """
    itin_json = json.dumps(current_itinerary, indent=2)
    prompt = f"""You are an itinerary editor assistant.

The user wants to modify the following travel itinerary:
```json
{itin_json}
```

Apply this edit command: "{command}"

Return the COMPLETE updated itinerary JSON with the same structure. Only change what the command requests.
IMPORTANT: if you change a hotel's `hotel_name` or a sightseeing place's `name` (e.g. swapping to a
different hotel/place), you MUST clear that item's `image_url` to null and set a fresh `image_query`
for it — its old photo no longer matches. Leave `image_url` untouched for anything you didn't rename.
Respond ONLY with the updated JSON object."""

    try:
        text = await _call_gemini(prompt, temperature=0.3)
        data = _extract_json(text)
        # Keep already-resolved photos; only fetch images for newly added items.
        return await resolve_itinerary_images(data, force=False)
    except Exception as e:
        print(f"Error editing itinerary with chat: {e}")
        return current_itinerary  # Return unchanged on failure


async def generate_chat_reply(lead_name: str, lead_notes: str, chat_history: list, new_message: str) -> str:
    """Generate a contextual travel agent response using Gemini AI."""
    history_str = ""
    for msg in chat_history:
        sender = "Customer" if msg.get("sender_type") == "customer" else "Agent"
        text = msg.get("message_text") or ""
        history_str += f"{sender}: {text}\n"

    prompt = f"""You are an AI travel booking copilot for TripPilot CRM. 
You are conversing directly with a customer to help plan their trip.

Customer Name: {lead_name}
Context / CRM Notes about customer: {lead_notes or 'No notes recorded yet.'}

Recent Chat History:
{history_str}
Customer's New Message: "{new_message}"

Goal:
Generate a highly engaging, helpful, and friendly chat response. 
- Keep the response short (max 70 words) so it reads well on mobile chat.
- Ask target travel questions (e.g. destinations, dates, budgets, number of travellers) if they are missing from notes/history.
- Do NOT output JSON. Write the response as if you are texting them.

Response:"""
    try:
        reply = await _call_gemini(prompt, temperature=0.7)
        return reply.strip()
    except Exception as e:
        print(f"Error generating chat reply from Gemini: {e}")
        return "Thanks for reaching out! Let me check the best options for your vacation and get back to you shortly."


async def generate_dashboard_insights(leads_list: list) -> dict:
    """
    Generate dynamic travel CRM insights using Gemini AI, focusing on
    Predictive Lead Scoring & High-Value Alerts.
    """
    if not leads_list:
        # Fallback to realistic mock insights if no leads are present
        return {
            "insights": [
                {
                    "type": "high_value",
                    "title": "Welcome to TripPilot Co-Pilot",
                    "description": "Add your first leads via CSV import, manual entry, or WhatsApp/Instagram integration to unlock tailored AI sales insights.",
                    "badge": "Action Needed",
                    "badge_cls": "badge-teal",
                    "lead_id": None,
                    "action_type": "none",
                    "action_text": "",
                    "action_target": ""
                },
                {
                    "type": "score",
                    "title": "Predictive Scoring Ready",
                    "description": "Once leads are added, the AI will score their purchase intent and flag high-value bookings automatically.",
                    "badge": "AI Feature",
                    "badge_cls": "badge-blue",
                    "lead_id": None,
                    "action_type": "none",
                    "action_text": "",
                    "action_target": ""
                }
            ]
        }

    # Format leads concisely for Gemini
    leads_summary = []
    for l in leads_list[:15]:  # Limit to last 15 leads to prevent token overflow
        leads_summary.append({
            "id": l.get("id"),
            "name": l.get("name"),
            "source": str(l.get("source")),
            "stage": str(l.get("stage")),
            "destination": l.get("destination"),
            "trip_type": l.get("trip_type"),
            "budget": l.get("budget"),
            "phone": l.get("phone"),
            "notes": l.get("notes")[:150] if l.get("notes") else ""
        })

    leads_json = json.dumps(leads_summary, indent=2)

    prompt = f"""You are a travel agency sales co-pilot.
Analyze these recent leads to identify high-value opportunities and calculate predictive booking/intent scores.

Recent Leads:
{leads_json}

Task:
Generate exactly 2 to 3 highly specific, actionable insights. At least one must be a "high_value" alert and one a "score" alert.
Return a valid JSON object with a single key "insights" mapping to a list of insight objects.
Each object MUST have these exact fields:
- "type": either "high_value" (for high value/budget/destination targets) or "score" (for booking intent probability)
- "title": A short bold title (max 5-6 words, e.g. "High-Value Alert: [Name]" or "High Booking Intent: [Name]")
- "description": Highly specific, friendly, and actionable sales tip referencing the customer's name, destination, or request details (max 25 words).
- "badge": Short pill label (e.g. "90% Hot", "High Value", "Maldives Pitch", "Warm Lead")
- "badge_cls": One of: "badge-red", "badge-green", "badge-teal", "badge-orange", "badge-blue"
- "lead_id": The integer ID of the associated lead
- "action_type": "whatsapp" (if phone exists and they are active) or "view_lead" (to view detail) or "none"
- "action_text": Button text (e.g. "Chat on WhatsApp", "View Lead Details")
- "action_target": The target value for the action (e.g. phone number like "919876543210" for whatsapp, or the lead ID as string)

Example JSON Output:
{{
  "insights": [
    {{
      "type": "high_value",
      "title": "High-Value Alert: Deepika",
      "description": "Deepika is planning a premium Maldives honeymoon. Pitch our luxury overwater villa package today.",
      "badge": "High Value",
      "badge_cls": "badge-red",
      "lead_id": 12,
      "action_type": "whatsapp",
      "action_text": "Chat on WhatsApp",
      "action_target": "918888888888"
    }}
  ]
}}

Respond ONLY with a JSON object. No explanation."""

    try:
        text = await _call_gemini(prompt, temperature=0.4)
        result = _extract_json(text)
        if isinstance(result, dict) and "insights" in result:
            return result
    except Exception as e:
        print(f"Error generating dashboard insights: {e}")

    # Robust local rules-based fallback if Gemini fails or times out
    insights = []
    # Find highest budget or specific destinations
    for l in leads_list:
        dest = (l.get("destination") or "").lower()
        budget = (l.get("budget") or "").lower()
        if "maldives" in dest or "bali" in dest or "lakh" in budget or "₹1" in budget or "₹2" in budget:
            insights.append({
                "type": "high_value",
                "title": f"High-Value Alert: {l.get('name')}",
                "description": f"{l.get('name')} is inquiring about a high-budget trip to {l.get('destination') or 'their destination'}. Follow up immediately with a premium itinerary.",
                "badge": "High Value",
                "badge_cls": "badge-red",
                "lead_id": l.get("id"),
                "action_type": "whatsapp" if l.get("phone") and l.get("phone") != "0000000000" else "view_lead",
                "action_text": "Chat on WhatsApp" if l.get("phone") and l.get("phone") != "0000000000" else "View Lead",
                "action_target": l.get("phone") if l.get("phone") and l.get("phone") != "0000000000" else str(l.get("id"))
            })
            break

    # Add a predictive score based on stage
    for l in leads_list:
        if l.get("stage") in ["qualified_hot", "fresh"]:
            prob = "85% Hot" if l.get("stage") == "qualified_hot" else "65% Warm"
            insights.append({
                "type": "score",
                "title": f"Conversion Probability: {l.get('name')}",
                "description": f"Lead {l.get('name')} has active follow-up interest from {str(l.get('source')).upper()}. Booking intent is high.",
                "badge": prob,
                "badge_cls": "badge-green" if "Hot" in prob else "badge-orange",
                "lead_id": l.get("id"),
                "action_type": "view_lead",
                "action_text": "View Lead",
                "action_target": str(l.get("id"))
            })
            break

    if not insights:
        # Fallback if no matching rules trigger
        insights = [
            {
                "type": "high_value",
                "title": f"Lead Highlight: {leads_list[0].get('name')}",
                "description": f"Recent activity registered for {leads_list[0].get('name')} from {str(leads_list[0].get('source')).upper()}.",
                "badge": "Fresh Lead",
                "badge_cls": "badge-teal",
                "lead_id": leads_list[0].get("id"),
                "action_type": "view_lead",
                "action_text": "View Details",
                "action_target": str(leads_list[0].get("id"))
            }
        ]

    return {"insights": insights}
