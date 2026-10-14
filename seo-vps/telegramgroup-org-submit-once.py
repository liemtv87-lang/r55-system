#!/usr/bin/env python3
"""One genuine submission per KQ247 group to TelegramGroup.org; persistent evidence."""
import datetime,json,os,pathlib,re
from playwright.sync_api import sync_playwright
URL="https://telegram-group.org/SubmitGroup.php"
STATE=pathlib.Path("/state/telegramgroup-org-once.json")
GROUPS={
 "football":("https://t.me/keochuyengia79","News","Cộng đồng tiếng Việt: lịch thi đấu, kết quả, nhận định bóng đá và kèo tham khảo, không bảo đảm thắng."),
 "lottery":("https://t.me/xsbm999","Other","Cộng đồng tiếng Việt: kết quả XSMB XSMT XSMN, thống kê và dự đoán xổ số tham khảo, không bảo đảm trúng.")
}
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(obj):
 STATE.parent.mkdir(parents=True,exist_ok=True)
 temp=STATE.with_suffix(".tmp")
 temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 os.replace(temp,STATE)
def run():
 try:d=json.loads(STATE.read_text(encoding="utf8"))
 except (OSError,ValueError):d={"directory":URL,"groups":{}}
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
  page=browser.new_page(viewport={"width":1300,"height":900})
  for name,(link,category,remark) in GROUPS.items():
   if name in d["groups"]:
    print("SKIP_EXISTING",name,d["groups"][name].get("status"),flush=True)
    continue
   record={"group":name,"target":link,"at":now(),"status":"inspect"}
   try:
    resp=page.goto(URL,wait_until="domcontentloaded",timeout=22000)
    if not resp or resp.status!=200:record.update(status="unavailable",http=resp.status if resp else None)
    elif page.locator('[data-sitekey],iframe[src*="captcha"],.g-recaptcha,.h-captcha,.cf-turnstile').count():record["status"]="human_verification_required"
    elif not all(page.locator(x).count() for x in ["#GroupLink","#Category","#Remark"]):record["status"]="form_changed"
    else:
     options=page.locator("#Category option").evaluate_all('(xs)=>xs.map(x=>({v:x.value,t:x.textContent.trim()}))')
     match=next((x for x in options if x["t"].lower()==category.lower() and x["v"]),None)
     if match is None:record.update(status="category_not_available",options=options)
     else:
      page.locator("#GroupLink").fill(link)
      page.locator("#Category").select_option(value=match["v"])
      page.locator("#Remark").fill(remark)
      button=page.locator('form[action*="SubmitGroupFinished.php"] input[type="submit"]')
      if not button.count():record["status"]="submit_control_missing"
      else:
       record.update(status="attempted_do_not_retry",category=category,clicked_at=now())
       d["groups"][name]=record;save(d)
       button.first.click(timeout=14000)
       page.wait_for_timeout(1200)
       record.update(status="submitted_unverified",final_url=page.url,excerpt=page.locator("body").inner_text(timeout=4000)[:600])
       if re.search(r"successfully|thank you|submission accepted",record["excerpt"],re.I):
        record["status"]="accepted_pending_publication"
   except Exception as e:record.update(status="error_or_uncertain_no_retry",error=type(e).__name__+":"+str(e)[:160])
   d["groups"][name]=record;save(d)
   print("KQ247_TGORG_RESULT",json.dumps(record,ensure_ascii=False),flush=True)
  browser.close()
 print("KQ247_TGORG_SUMMARY",json.dumps(d,ensure_ascii=False),flush=True)
if __name__=="__main__":run()
