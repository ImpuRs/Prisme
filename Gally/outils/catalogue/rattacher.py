"""Rattache à chaque code article (lien /article/<code> du PDF) le texte qui le décrit sur sa page.
Niveaux : en-tête de page · titre produit · sous-titre · titre de tableau · tête de colonne · texte de sa ligne."""
import json,re,sys,collections
BRUIT=re.compile(r'^(\d{6}|TM|-|–|•|code|\(1|pièce\)|Cond\.\)?|Code|Prix|ht|[A-Z]|\d+,\d\d|\(\d+)$')
GAP=130
def gras(f): return any(k in f for k in ('Bd','Hv','Blk','Bold','Black','Heavy'))
def segments(words, gap=25):
  ws=sorted(words,key=lambda w:(w[3],w[1]));lines=[];cur=[]
  for w in ws:
    if cur and abs(w[3]-cur[0][3])>2.5: lines.append(cur);cur=[]
    cur.append(w)
  if cur: lines.append(cur)
  segs=[]
  for l in lines:
    l=sorted(l,key=lambda w:w[1]);s=[l[0]]
    for w in l[1:]:
      if w[1]-s[-1][2]>gap or abs(w[4]-s[-1][4])>1.5: segs.append(s);s=[]
      s.append(w)
    segs.append(s)
  return segs
def nettoyer(txt):
  txt=re.sub(r'(f[il]|ff) (?=[a-zà-ÿ])',r'\1',txt)            # ligatures coupées : « fi xe » → « fixe »
  txt=re.sub(r'\S*P2C_\S*','',txt)                            # balises de mise en page oubliées
  return ' '.join(w[::2] if len(w)>=4 and len(w)%2==0 and all(w[i]==w[i+1] for i in range(0,len(w),2)) else w
                  for w in txt.split())                       # « MMAATTÉÉRRIIEELL » → « MATÉRIEL »
def uniq(txt): return ' '.join(dict.fromkeys(nettoyer(txt).split()))
def traiter(d):
  words=[w for w in d['words'] if 5<=w[4]<20]
  links={}
  for c,x0,t,x1,b in d['links']: links.setdefault((c,round(x0),round(t)),(c,x0,t,x1,b))
  links=list(links.values())
  S=segments(words)
  entete=[];titres=[]
  for s in S:
    sz=max(w[4] for w in s);txt=' '.join(w[0] for w in s)
    if s[0][3]<35 and sz>=11: entete.append(txt)
    elif sz>=10 and gras(s[0][5]): titres.append([s[0][3],s[0][1],s[-1][2],txt,sz])
  # titres sur plusieurs lignes : fusion
  titres.sort();fus=[]
  for t in titres:
    p=fus[-1] if fus else None
    if p and abs(p[1]-t[1])<3 and abs(p[4]-t[4])<0.5 and 0<t[0]-p[5]<16: p[3]+=' '+t[3];p[5]=t[0]
    else: fus.append(t+[t[0]])
  titres=fus
  mid=[t[1] for t in titres if 220<t[1]<420 and len(t[3])>=12 and not any(u is not t and abs(u[0]-t[0])<3 for u in titres)]
  split=min(mid)-8 if mid else None
  def zone(x): return 0 if split is None or x<split else 1
  par=collections.defaultdict(list)
  for w in words:
    if BRUIT.match(w[0]) or w[4]>=10: continue
    cand=[]
    for k,(c,x0,t,x1,b) in enumerate(links):
      if x0<w[2]-1 or x0-w[2]>420 or zone(w[1])!=zone(x0): continue
      dv=abs(w[3]-t)
      if dv<=10: cand.append((dv,k))
    if not cand: continue
    m=min(cand)[0]
    for dv,k in cand:
      if dv>m+1.5: continue
      c,x0,t,x1,b=links[k]
      lo,hi=min(w[3],t)-3,max(w[3],t)+3
      xs=sorted((v[1],v[2]) for v in words if lo<=v[3]<=hi and v[2]>w[2]-1 and v[1]<x0 and zone(v[1])==zone(x0))
      end=w[2];ok=True
      for a,bb in xs:
        if a-end>GAP: ok=False;break
        end=max(end,bb)
      if ok and x0-end<=GAP: par[k].append(w)
  folio=''
  for s_ in S:
    if s_[0][3]>790:
      m=re.search(r'\b([A-Z]{1,3}) ?(\d{1,4})$',' '.join(w[0] for w in s_))
      if m: folio=m.group(1)+' '+m.group(2)
  res={}
  for k,(c,x0,t,x1,b) in enumerate(links):
    ws=par.get(k,[])
    left=min([w[1] for w in ws],default=x0-150)
    tp=sorted([x for x in titres if x[0]<t and left-60<=x[1]<=x0 and zone(x[1])==zone(x0)],key=lambda x:-x[0])
    g=[x for x in tp if x[4]>=12.5][:1]; p=[x for x in tp if x[4]<12.5][:1]
    tit=' / '.join(nettoyer(x[3]) for x in sorted(g+p))
    tab='';col=''
    for s in sorted(S,key=lambda s:-s[0][3]):
      y=s[0][3]
      if y>=t-2 or t-y>300: continue
      if not tab and t-y<150:
        seg=[w for w in s if left-40<=w[1]<x0-30 and gras(w[5]) and w[4]<10 and w[0].isupper() and len(w[0])>2 and not BRUIT.match(w[0])]
        if seg: tab=' '.join(w[0] for w in seg)
      if not col:
        seg=[w for w in s if gras(w[5]) and w[4]<11 and w[2]>x0-70 and w[1]<x1+50 and not BRUIT.match(w[0])]
        if seg: col=uniq(' '.join(w[0] for w in seg))
    ligne=uniq(' '.join(w[0] for w in sorted(ws,key=lambda w:(round(w[3]),w[1]))))
    parts=[uniq(' '.join(entete)),tit,uniq(tab),col,ligne]
    res.setdefault(c,[]).append((d['page'],folio,' | '.join(x for x in parts if x)))
  return res
if __name__=='__main__':
  allr={}
  for f in sys.argv[2:]:
    for line in open(f,encoding='utf8'):
      d=json.loads(line)
      if d.get('links'):
        for c,v in traiter(d).items(): allr.setdefault(c,[]).extend(v)
  json.dump(allr,open(sys.argv[1],'w',encoding='utf8'),ensure_ascii=False)
  print(len(allr))
