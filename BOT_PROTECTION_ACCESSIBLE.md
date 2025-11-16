# Bot Protection Strategy - Accessibility-First Approach

## Core Principle
**All protections must be invisible to legitimate users.** No CAPTCHAs, no challenges, no barriers.

---

## ✅ Accessibility-Friendly Protections (Recommended)

### 1. **Persistent Rate Limiting (Database-backed)**
**Why:** Current in-memory rate limiting resets on server restart, allowing abuse.

**Implementation:**
- Store rate limit data in SQLite database (you already have it)
- Persist across server restarts
- No user impact - completely transparent

**Accessibility Impact:** ✅ None - works invisibly

---

### 2. **Improved Heuristic Detection**
**Why:** Current heuristics may flag legitimate disabled users who:
- Use repetitive questions (perseveration)
- Type slowly or make typos
- Use assistive tech that sends rapid requests

**Key Improvements:**
- **Distinguish between bot patterns and disability patterns:**
  - Bots: Perfect timing, identical requests, no variation
  - Disabled users: Variable timing, similar but not identical requests, natural pauses
- **Increase thresholds** to avoid false positives
- **Add "grace period"** for new sessions (first 5 requests always allowed)
- **Track request diversity** - bots send identical prompts, users vary

**Accessibility Impact:** ✅ Protects legitimate users from false blocking

---

### 3. **Cost Limits with Graceful Degradation**
**Why:** Prevent runaway costs without blocking users.

**Implementation:**
- Set daily/hourly spending limits (e.g., $50/day)
- When limit reached: Return friendly error message
- **Don't block** - just inform user to try again later
- Reset automatically

**Accessibility Impact:** ✅ Clear, friendly messaging - no barriers

---

### 4. **IP Reputation Checking (Background)**
**Why:** Block known bot IPs without affecting legitimate users.

**Implementation:**
- Check IPs against abuseipdb.com or similar (free tier available)
- Only block IPs with high abuse scores (>90% abuse reports)
- **Whitelist** common assistive tech IPs if needed
- Log but don't block suspicious IPs initially

**Accessibility Impact:** ✅ Invisible to users

---

### 5. **Request Fingerprinting (Privacy-Preserving)**
**Why:** Detect bot farms using multiple IPs.

**Implementation:**
- Create fingerprint from: User-Agent, Accept-Language, Screen Resolution (if available)
- **Don't use** for blocking - only for detection
- Track if same fingerprint uses 50+ different IPs = bot farm
- Flag for manual review, don't auto-block

**Accessibility Impact:** ✅ No user interaction required

---

### 6. **Progressive Rate Limiting**
**Why:** Slow down abuse without blocking legitimate users.

**Implementation:**
- First 10 requests: Normal speed
- Next 10 requests: Slight delay (100ms) - invisible to humans
- After 20 requests: Check if user is authenticated
- **Never block** - just slow down slightly

**Accessibility Impact:** ✅ Delays are imperceptible to humans

---

### 7. **Session Quality Scoring**
**Why:** Distinguish between legitimate users and bots.

**Scoring Factors (higher = more legitimate):**
- ✅ Variable request timing (humans don't send requests at exact intervals)
- ✅ Request content variation (users ask different questions)
- ✅ Natural pauses between requests (humans take breaks)
- ✅ Browser features present (JavaScript, localStorage, etc.)
- ✅ Referrer headers present (came from your site)
- ✅ Accept-Language headers match IP location

**Low Score = Bot, High Score = Legitimate User**

**Accessibility Impact:** ✅ Rewards natural behavior patterns

---

### 8. **Token Request Throttling**
**Why:** Prevent token farming attacks.

**Implementation:**
- Limit token requests to 1 per 30 seconds per session
- Reuse tokens until expiry (you already do this)
- Track token usage - if token requested but never used = suspicious

**Accessibility Impact:** ✅ No impact - tokens are reused anyway

---

### 9. **Input Validation Improvements**
**Why:** Prevent cost amplification attacks.

**Implementation:**
- **For anonymous users:** Reduce MAX_PROMPT_LENGTH to 2000 chars
- **For authenticated users:** Keep 10000 chars
- Validate history array more strictly
- Reject obviously malicious patterns (e.g., 1000 identical messages)

**Accessibility Impact:** ✅ Legitimate users won't hit 2000 char limit

---

### 10. **Monitoring & Alerting**
**Why:** Catch abuse early before it becomes expensive.

**Implementation:**
- Alert when daily spending exceeds threshold
- Alert when single IP makes 100+ requests
- Alert when suspicious patterns detected
- **Don't auto-block** - just alert for manual review

**Accessibility Impact:** ✅ No user impact

---

## ❌ Avoid These (Accessibility Barriers)

### ❌ CAPTCHA/hCaptcha
- **Why bad:** Screen readers struggle, cognitive load, motor difficulties
- **Alternative:** Use heuristics + fingerprinting instead

### ❌ Email Verification Required
- **Why bad:** Adds friction, some disabled users struggle with email
- **Alternative:** Optional verification for higher limits

### ❌ Challenge-Response Systems
- **Why bad:** Blocks users with cognitive impairments
- **Alternative:** Background detection only

### ❌ Strict Rate Limiting
- **Why bad:** May block legitimate repetitive behavior
- **Alternative:** Progressive, adaptive limits

### ❌ IP Blocking Without Review
- **Why bad:** May block shared IPs (schools, care homes)
- **Alternative:** Flag for review, don't auto-block

---

## Implementation Priority

### Phase 1 (Immediate - High Impact)
1. ✅ Persistent rate limiting (database)
2. ✅ Cost limits with alerts
3. ✅ Improved heuristics (disability-aware)

### Phase 2 (Short-term - Medium Impact)
4. ✅ IP reputation checking
5. ✅ Request fingerprinting
6. ✅ Token throttling

### Phase 3 (Long-term - Nice to Have)
7. ✅ Session quality scoring
8. ✅ Progressive rate limiting
9. ✅ Enhanced monitoring

---

## Key Metrics to Track

1. **False Positive Rate:** Legitimate users blocked
2. **Cost per User:** Average spending per session
3. **Abuse Detection Rate:** Bots caught vs. missed
4. **User Experience:** No increase in error rates

---

## Testing with Disabled Users

Before deploying any protection:
1. Test with screen readers
2. Test with repetitive questions (perseveration)
3. Test with slow typing
4. Test with assistive tech (Grid3, etc.)
5. Monitor for false positives

---

## Emergency Response

If abuse detected:
1. **Don't panic** - protections will slow it down
2. **Review logs** to understand pattern
3. **Temporarily reduce limits** if needed
4. **Never block** legitimate users
5. **Contact hosting provider** if DDoS-level attack

---

## Summary

**Protect the backend, not the frontend.** All protections should be:
- ✅ Server-side only
- ✅ Transparent to users
- ✅ Disability-aware
- ✅ Non-blocking (slow down, don't stop)
- ✅ Monitored (alert, don't auto-block)

The goal is to make abuse expensive and slow, not to create barriers for legitimate disabled users.

