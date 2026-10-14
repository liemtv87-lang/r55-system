#!/usr/bin/env python3
"""Two one-time public Telegram community directory applications.

No credentials, automated bypass or duplicate POSTs. This is a submission,
not evidence of a published backlink. Receipts persist on VPS.
"""
import datetime,json,os,pathlib,re
from playwright.sync_api import sync_playwright
FORM="https://telegramchannels.io/submit-channel"
STATE=pathlib.Path("/state/tgdirectory-once.json")
GROUPS={
 "football":{"link":"https://t.me/keochuyengia79","topic":["Sports","Sport"],"description":"Cộng đồng KQ247 miễn phí: lịch thi đấu, kết quả bóng đá và thống kê, nhận định châu Á/Tài Xỉu tham khảo; không bảo đảm thắng."},
 "lottery":{"link":"https://t.me/xsbm999","topic":["News","Entertainment"],"description":"Nhóm KQ247 miễn phí: kết quả xổ số XSMB XSMT XSMN theo đài, thống kê và phân tích dự đoán tham khảo; không bảo đảm trúng."}
}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(d):
 STATE.parent.mkdir(parents=True,exist_ok=True)
 tmp=STATE.with_suffix(".tmp")
 tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 os.replace(tmp,STATE)
def vis(loc):return [x for x in loc.all() if x.is_visible()]
def snippet(page):
 try:return page.locator("body").inner_text(timeout=4000)[-700:]
 except Exception:return ""
def risk(page):return page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count()>0
def go(page, k, data):
 g=GROUPS[k]
 r={"group":k,"target":g["link"],"start_at":now(),"status":"inspection"}
 response=page.goto(FORM,wait_until="domcontentloaded",timeout=26000)
 if not response or response.status!=200:return dict(r,status="site_unavailable",http=response.status if response else None)
 if risk(page):return dict(r,status="captcha_requires_owner")
 inp=vis(page.locator('input[placeholder*="t.me"],input[type="url"]'))
 if not inp:return dict(r,status="link_field_missing")
 inp[0].fill(g["link"])
 desc=vis(page.locator("textarea"))
 if desc:desc[0].fill(g["description"])
 missing=set(["category","type","language"])
 for sl in vis(page.locator("select")):
  opts=sl.locator("option").evaluate_all('(xs)=>xs.map(x=>({v:x.value,t:x.textContent.trim()}))')
  pool=[x for x in opts if x["v"]]
  vals=[x["t"].lower() for x in pool]
  if "Group".lower() in vals and "type" in missing:
   match=next(x for x in pool if x["t"].lower()=="group")
   sl.select_option(value=match["v"]);missing.discard("type")
  elif any("vietnamese" in s or "tiếng việt" in s for s in vals) and "language" in missing:
   match=next(x for x in pool if "vietnamese" in x["t"].lower() or "tiếng việt" in x["t"].lower())
   sl.select_option(value=match["v"]);missing.discard("language")
  elif any(s in ("other","other languages","other language") for s in vals) and "language" in missing:
   match=next(x for x in pool if x["t"].lower() in ("other","other languages","other language"))
   sl.select_option(value=match["v"]);missing.discard("language");r["language"]="Other (Vietnamese not offered)"
  elif "category" in missing:
   match=next((x for key in g["topic"] for x in pool if x["t"].lower()==key.lower()),None)
   if match:sl.select_option(value=match["v"]);missing.discard("category");r["category"]=match["t"]
 r["missing_choices"]=sorted(missing)
 if missing:
  options=page.locator("select").evaluate_all('(xs)=>xs.map(x=>({name:x.name,options:[...x.options].map(o=>o.textContent.trim())}))')
  return dict(r,status="missing_matching_select_choices",select_options=options,excerpt=snippet(page))
 if risk(page):return dict(r,status="captcha_requires_owner")
 submit=vis(page.get_by_role("button",name=re.compile("Submit for review",re.I)))
 if not submit:return dict(r,status="submit_button_missing",excerpt=snippet(page))
 r["status"]="attempted_no_retry";r["clicked_at"]=now()
 data["groups"][k]=r;save(data)
 submit[0].click(timeout=15000)
 page.wait_for_timeout(2100)
 r["status"]="submitted_outcome_unverified"
 r["after_url"]=page.url
 r["after_excerpt"]=snippet(page)
 if re.search(r"successfully submitted|thank you for submitting|pending approval|submission received",r["after_excerpt"],re.I):
  r["status"]="acknowledged_pending_review"
 return r
def main():
 try:d=json.loads(STATE.read_text(encoding="utf8"))
 except (OSError,ValueError):d={"source":FORM,"groups":{}}
 if not isinstance(d.get("groups"),dict):raise RuntimeError("bad state")
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
  page=browser.new_page(viewport={"width":1260,"height":850})
  for k in GROUPS:
   if k in d["groups"]:
    prev=d["groups"][k]
    if prev.get("status")=="missing_matching_select_choices" and not prev.get("retried_pre_submit_once"):
     prev["retried_pre_submit_once"]=True
     save(d)
    else:
     print("SKIPPED_PREVIOUS",k,prev.get("status"),flush=True)
     continue
   try:r=go(page,k,d)
   except Exception as e:r={"group":k,"target":GROUPS[k]["link"],"status":"error_or_uncertain_no_retry","error":type(e).__name__+":"+str(e)[:180]}
   d["groups"][k]=r;save(d)
   print("TGDIR_ONCE_RESULT",json.dumps(r,ensure_ascii=False),flush=True)
  browser.close()
 print("TGDIR_ONCE_SUMMARY",json.dumps(d,ensure_ascii=False),flush=True)
if __name__=="__main__": main()
