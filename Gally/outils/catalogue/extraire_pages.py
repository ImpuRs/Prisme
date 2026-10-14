import pdfplumber,json,sys,re
pdf_path,start,end,out=sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),sys.argv[4]
pdf=pdfplumber.open(pdf_path)
with open(out,'w',encoding='utf8') as f:
  for n in range(start,min(end,len(pdf.pages))):
    p=pdf.pages[n]
    try:
      links=[]
      for h in p.hyperlinks:
        m=re.search(r'/article/(\d+)',h.get('uri') or '')
        if m: links.append([m.group(1),round(h['x0'],1),round(h['top'],1),round(h['x1'],1),round(h['bottom'],1)])
      words=[[w['text'],round(w['x0'],1),round(w['x1'],1),round(w['top'],1),round(w['size'],1),w['fontname'].split('+')[-1]] for w in p.extract_words(extra_attrs=['size','fontname'])] if links else []
      f.write(json.dumps({'page':n+1,'links':links,'words':words},ensure_ascii=False)+'\n')
    except Exception as e:
      f.write(json.dumps({'page':n+1,'error':str(e)})+'\n')
    p.close()
