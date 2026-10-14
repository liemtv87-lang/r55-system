#!/usr/bin/env python3
"""One truthful submission per KQ247 Telegram group to the free TG-Hub form."""
import datetime,json,os,pathlib,re
from playwright.sync_api import sync_playwright
FORM="https://tg-hub.com/submit-telegram-channel-and-group-links/"
STATE=pathlib.Path("/state/tghub-once.json")
GROUPS={
 "football":{"link":"https://t.me/keochuyengia79","name":"KQ247 - Lịch bóng đá và nhận định miễn phí",
            "category":["Sports","Sport","Football"],
            "description":"Cộng đồng KQ247 miễn phí theo dõi lịch thi đấu, kết quả và dữ liệu kèo châu Á/Tài Xỉu tham khảo. Dự đoán không bảo đảm kết quả."},
 "lottery":{"link":"https://t.me/xsbm999","name":"DỰ ĐOÁN XỔ SỐ 3 MIỀN - KQ247",
            "category":["News","Entertainment","Games"],
            "description":"Nhóm KQ247 miễn phí chia sẻ kết quả và lịch xổ số XSMB XSMT XSMN theo đài, thống kê và dự đoán tham khảo. Không bảo đảm trúng thưởng."}}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(d):
 STATE.parent.mkdir(parents=True,exist_ok=True)
 tmp=STATE.with_suffix(".tmp")
 tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 os.replace(tmp,STATE)
def visible(loc):return [x for x in loc.all() if x.is_visible()]
def body(page):
 try:return page.locator("body").inner_text(timeout=4000)[-900:]
 except Exception:return ""
def blocked(page):return page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count()>0
def fill(page,selector,value):
 x=visible(page.locator(selector))
 if not x:return False
 x[0].fill(value)
 return True
def run_one(page,key,doc):
 g=GROUPS[key]
 r={"group":key,"target":g["link"],"started":now(),"status":"inspect"}
 resp=page.goto(FORM,wait_until="domcontentloaded",timeout=27000)
 if not resp or resp.status!=200:return dict(r,status="unavailable",http=resp.status if resp else None)
 if blocked(page):return dict(r,status="owner_verification_required")
 have_name=fill(page,'input[placeholder="Name"],input[name*="name" i]',g["name"])
 have_link=fill(page,'input[placeholder="Link"],input[name*="link" i]',g["link"])
 have_language=fill(page,'input[placeholder*="English"],input[name*="language" i]','Vietnamese')
 have_desc=fill(page,'textarea',g["description"])
 r["fields"]={"name":have_name,"link":have_link,"language":have_language,"description":have_desc}
 if not all(r["fields"].values()):
  controls=page.locator("input,select,textarea,button").evaluate_all("""xs=>xs.filter(x=>x.getBoundingClientRect().width>0).slice(0,30).map(x=>({tag:x.tagName,name:x.name||'',placeholder:x.placeholder||'',type:x.type||'',label:x.getAttribute('aria-label')||''}))""")
  return dict(r,status="form_changed",visible_controls=controls,excerpt=body(page))
 r["category"]=None
 r["country"]=None
 for sel in visible(page.locator("select")):
  choices=sel.locator("option").evaluate_all('(xs)=>xs.map(x=>({v:x.value,t:x.textContent.trim()}))')
  valid=[x for x in choices if x["v"]]
  if not r["country"]:
   country=next((x for x in valid if x["t"].strip().lower() in ("vietnam","viet nam","việt nam")),None)
   if country:
    sel.select_option(value=country["v"]);r["country"]=country["t"];continue
  if not r["category"]:
   cat=next((x for c in g["category"] for x in valid if x["t"].lower()==c.lower()),None)
   if cat:sel.select_option(value=cat["v"]);r["category"]=cat["t"]
 if not r["country"] or not r["category"]:
  return dict(r,status="truthful_country_or_category_missing",excerpt=body(page))
 required_emails=page.locator('input[type="email"][required],input[name*="email" i][required]')
 if required_emails.count():return dict(r,status="owner_email_required")
 if blocked(page):return dict(r,status="owner_verification_required")
 submit=visible(page.get_by_role("button",name=re.compile(r"^Submit$",re.I)))
 if not submit:return dict(r,status="submit_button_missing",excerpt=body(page))
 r["status"]="attempted_no_retry";r["clicked_at"]=now()
 doc["groups"][key]=r;save(doc)
 submit[0].click(timeout=12000)
 page.wait_for_timeout(2000)
 r["status"]="unverified_response"
 r["result_url"]=page.url;r["response_excerpt"]=body(page)
 if re.search(r"thank you|submitted for review|submitted successfully|submission received|success!",r["response_excerpt"],re.I):
  r["status"]="accepted_pending_publication"
 return r
def main():
 try:d=json.loads(STATE.read_text(encoding="utf8"))
 except (OSError,ValueError):d={"directory":FORM,"groups":{}}
 if not isinstance(d.get("groups"),dict):raise RuntimeError("bad state")
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
  page=browser.new_page(viewport={"width":1250,"height":900})
  for key in GROUPS:
   if key in d["groups"]:
    print("NO_DUPLICATES",key,d["groups"][key].get("status"),flush=True);continue
   try:r=run_one(page,key,d)
   except Exception as e:r={"group":key,"target":GROUPS[key]["link"],"status":"error_or_uncertain_no_retry","error":type(e).__name__+":"+str(e)[:230]}
   d["groups"][key]=r;save(d)
   print("TGHUB_RESULT",json.dumps(r,ensure_ascii=False),flush=True)
  browser.close()
 print("TGHUB_REPORT",json.dumps(d,ensure_ascii=False),flush=True)
if __name__=="__main__":main()
