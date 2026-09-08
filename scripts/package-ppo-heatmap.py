import json,struct,hashlib,sys
from pathlib import Path
p=Path(sys.argv[1]);d=json.loads(p.read_text(encoding='utf-8'));blob=bytearray()
for layers in [m.pop('layers') for m in d['models']]+[r.pop('gradient') for r in d['rounds']]:
 for l in layers:
  for row in l['weight']:blob.extend(struct.pack('<'+'f'*len(row),*row))
  blob.extend(struct.pack('<'+'f'*len(l['bias']),*l['bias']))
d['source'].pop('checkpointSha256',None);d['source']['initialization']='SB3 orthogonal initialization; action mean bias -0.9; fresh VecNormalize statistics'
root=Path('public/rocket');h=hashlib.sha256(blob).hexdigest()[:12];name=f'ppo-initialization-{h}.bin';(root/name).write_bytes(blob)
d['binary']='/rocket/'+name;d['binarySha256']=hashlib.sha256(blob).hexdigest();d['recordSha256']=hashlib.sha256(p.read_bytes()).hexdigest();(root/'ppo-initialization.json').write_text(json.dumps(d,separators=(',',':')),encoding='utf-8');print(len(d['rounds']),len(blob),'bytes lossless float32')
