import io,json,pickle,zipfile,hashlib,sys
from pathlib import Path
import torch
class IgnoredRng:
 def __init__(self,*args): pass
 def __setstate__(self,state): pass
class StatsUnpickler(pickle.Unpickler):
 def find_class(self,module,name):
  if module=='numpy.random._pickle': return IgnoredRng
  return super().find_class(module,name)
root=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
for name,model,stats,energy in [
 ('standard','saved_models/ppo_rocket_v7.zip','saved_models/vec_normalize_stats_v7.pkl',False),
 ('energy','results/reproducible/energy_ppo_from_scratch_time/models/pure_energy_ppo_model.zip','results/reproducible/energy_ppo_from_scratch_time/models/pure_energy_vec_normalize.pkl',True)]:
 with zipfile.ZipFile(root/model) as z:
  weights=torch.load(io.BytesIO(z.read('policy.pth')),map_location='cpu',weights_only=True)
  config=json.loads(z.read('data'))
 with open(root/stats,'rb') as f: norm=StatsUnpickler(f).load()
 keys=sorted(k[:-7] for k in weights if k.startswith('mlp_extractor.policy_net.') and k.endswith('.weight'))+['action_net']
 data={'name':name,'energy':energy,'mean':norm.obs_rms.mean.tolist(),'variance':norm.obs_rms.var.tolist(),'epsilon':norm.epsilon,'clip':norm.clip_obs,'layers':[{'weight':weights[k+'.weight'].tolist(),'bias':weights[k+'.bias'].tolist()} for k in keys], 'source':'https://github.com/17362975180/drl-rocket-landing-control','revision':'82bbe1b4ce414f7fce593c0e8159249e78fdac0d','checkpoint':model,'sha256':hashlib.sha256((root/model).read_bytes()).hexdigest()}
 (out/(name+'.json')).write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
 print(name,[(len(l['weight']),len(l['weight'][0])) for l in data['layers']],config.get('policy_kwargs'))
