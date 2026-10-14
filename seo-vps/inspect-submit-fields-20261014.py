#!/usr/bin/env python3
"""Inspect public directory submission form field metadata; no POST/registration."""
from html.parser import HTMLParser
from pathlib import Path
import importlib.util
import json
import datetime
spec=importlib.util.spec_from_file_location("audit",Path(__file__).with_name("bulk-sitemap-audit.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
URLS=[
"https://groupswa.com/submit-group-links/",
"https://tgfinder.net/submit",
"https://telegramchannels.io/submit-channel",
"https://tg-hub.com/submit-telegram-channel-and-group-links/",
"https://www.telegramradar.com/en/submit",
"https://tglinks.net/en/submit",
"https://www.telegramhub.app/submit",
"https://televerse.click/submit",
]
class Inspector(HTMLParser):
 def __init__(self):
  super().__init__();self.forms=[];self.form=None;self.current_select=None;self.capture=False;self.option=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=="form":
   self.form={"id":a.get("id"),"action":a.get("action"),"method":a.get("method"),"fields":[]};self.forms.append(self.form)
  if not self.form:return
  if tag in ("input","textarea","select","button"):
   field={k:a.get(k,"") for k in ("name","id","type","placeholder")};field["tag"]=tag;field["required"]="required" in a
   if tag=="select":
    field["options"]=[];self.current_select=field
   self.form["fields"].append(field)
  if tag=="option" and self.current_select is not None:
   self.option={"value":a.get("value",""),"label":""}
 def handle_data(self,data):
  if self.option is not None:self.option["label"]+=data
 def handle_endtag(self,tag):
  if tag=="option" and self.current_select is not None and self.option is not None:
   self.option["label"]=self.option["label"].strip()[:75]
   if len(self.current_select["options"])<60:self.current_select["options"].append(self.option)
   self.option=None
  if tag=="select":self.current_select=None
  if tag=="form":self.form=None
def main():
 rows=[]
 for u in URLS:
  rec={"url":u}
  try:
   raw, final=m.read_url(u,3000000)
   parser=Inspector();parser.feed(raw.decode("utf-8","replace"))
   rec.update(actual_url=final,forms=parser.forms)
  except Exception as e:rec["error"]=type(e).__name__+":"+str(e)[:100]
  rows.append(rec)
 obj={"at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"mode":"readonly_form_metadata","form_pages":rows,"submissions_attempted":0}
 Path("reports").mkdir(exist_ok=True)
 Path("reports/kq247-field-inspection-20261014.json").write_text(json.dumps(obj,indent=2,ensure_ascii=False))
 for r in rows:
  print("FORM_FIELDS="+json.dumps(r,ensure_ascii=False)[:6000],flush=True)
if __name__=="__main__":main()
