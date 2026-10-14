#!/usr/bin/env python3
"""One-time, consent-based, truthful Telegram directory submissions (TGFinder).
Use only TGFinder's public submission form. No retries, accounts or bypasses.
"""
import datetime, http.cookiejar, json, os, re, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

URL="https://tgfinder.net/submit"
GROUPS=[
 ("football","KQ247 - Kèo Bóng Đá","https://t.me/keochuyengia79",
  "Cộng đồng tiếng Việt chia sẻ lịch thi đấu, phân tích bóng đá và dự đoán kèo châu Á, tài xỉu. Nội dung tham khảo.",
  ("Sports",)),
 ("lottery","KQ247 - Kết quả Xổ số","https://t.me/xsbm999",
  "Cộng đồng tiếng Việt về kết quả xổ số XSMB, XSMT, XSMN, phân tích thống kê và thảo luận dự đoán số.",
  ("Lottery","Betting","News")),
]
AGENT="Mozilla/5.0 (compatible; KQ247 directory owner listing request)"
class Form(HTMLParser):
 def __init__(self):
  super().__init__();self.inside=False;self.select=None;self.option=None
  self.hidden={};self.options={}
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=="form" and (a.get("method","").lower()=="post"):
   self.inside=True
  if not self.inside:return
  if t=="input" and a.get("name") and a.get("type")=="hidden":
   self.hidden[a["name"]]=a.get("value","")
  if t=="select":
   self.select=a.get("name");self.options.setdefault(self.select,[])
  if t=="option" and self.select:
   self.option={"value":a.get("value",""),"label":""}
 def handle_data(self,s):
  if self.option is not None:self.option["label"]+=s
 def handle_endtag(self,t):
  if t=="option" and self.option is not None and self.select:
   self.option["label"]=self.option["label"].strip()
   self.options[self.select].append(self.option);self.option=None
  if t=="select":self.select=None
  if t=="form":self.inside=False
def option_value(opts,labels):
 for label in labels:
  exact=next((x for x in opts if x["label"].casefold()==label.casefold()),None)
  if exact:return exact["value"],exact["label"]
 return None,None
def do(group,title,target,desc,categories):
 rec={"group":group,"target":target,"directory":"TGFinder","at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"state":"not_attempted"}
 jar=http.cookiejar.CookieJar()
 op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
 try:
  r=op.open(urllib.request.Request(URL,headers={"User-Agent":AGENT,"Accept":"text/html"}),timeout=14)
  parser=Form();parser.feed(r.read(1000000).decode("utf8","replace"))
  csrf=parser.hidden.get("_token")
  cid,cl=option_value(parser.options.get("category_id",[]),categories)
  country,_=option_value(parser.options.get("country_id",[]),["Vietnam","Viet Nam"])
  lang,_=option_value(parser.options.get("language_id",[]),["Vietnamese"])
  typ,_=option_value(parser.options.get("type",[]),["Group"])
  if not all([csrf,cid,country,lang,typ]):
   rec.update(state="missing_required_field",field_available={
    "csrf":bool(csrf),"category":cl,"country":bool(country),"language":bool(lang),"type":bool(typ)
   });return rec
  payload={"_token":csrf,"type":typ,"title":title,"telegram_url":target,
     "category_id":cid,"country_id":country,"language_id":lang,
     "description":desc,"owner_name":"KQ247"}
  data=urllib.parse.urlencode(payload).encode()
  # Exactly one submission per group. Never retry after dispatch.
  rec.update(state="dispatched_once",category=cl)
  req=urllib.request.Request(URL,data=data,headers={
    "User-Agent":AGENT,"Referer":URL,"Origin":"https://tgfinder.net",
    "Content-Type":"application/x-www-form-urlencoded",
    "Accept":"text/html,application/xhtml+xml"},method="POST")
  try:
   res=op.open(req,timeout=16)
   body=res.read(1000000).decode("utf8","replace")
   status=res.status;final=res.url
  except urllib.error.HTTPError as e:
   status=e.code;final=e.url;body=e.read(1000000).decode("utf8","replace")
  clean=re.sub(r"<[^>]+>"," ",body)
  clean=re.sub(r"\\s+"," ",clean).strip()
  low=clean.casefold()
  okay=bool(re.search(r"(submitted successfully|submission received|successfully submitted|pending approval|thank you for submitting|awaiting review|has been submitted|your submission)",low))
  fail=bool(re.search(r"(invalid link|validation error|unprocessable|something went wrong|try again later|error processing)",low))
  rec.update(state="pending_review" if okay and not fail else "rejected_or_error" if fail or status>=400 else "uncertain_submission",
   response_http=status,final_url=final[:250],response_excerpt=clean[-650:])
 except Exception as ex:
  rec.update(state="error_before_or_after_dispatch",error=type(ex).__name__+":"+str(ex)[:160])
 return rec
def main():
 path=Path("reports/kq247-tgfinder-once-20261014.json")
 if path.exists():
  print("EXISTING_ATTEMPT_REPORT: do not retry");return
 path.parent.mkdir(exist_ok=True)
 rows=[]
 for x in GROUPS:
  if rows and rows[-1].get("state")=="error_before_or_after_dispatch":
   # stop if environment uncertain; no blind retries
   break
  rows.append(do(*x))
  path.write_text(json.dumps({"at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
   "one_time":True,"submissions":rows,"new_public_backlinks_confirmed":0},indent=2,ensure_ascii=False))
 for r in rows:print("KQ247_TGFINDER_SUBMISSION="+json.dumps(r,ensure_ascii=False),flush=True)
if __name__=="__main__":main()
