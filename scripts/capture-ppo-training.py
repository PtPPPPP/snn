"""Ticket-bound SB3 PPO continuation capture for the educational playback."""
import argparse,sys,json,hashlib,pickle
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('stage');p.add_argument('--config',type=Path,required=True);p.add_argument('--ticket',type=Path,required=True);a=p.parse_args()
root=a.config.resolve().parent;sys.path.insert(0,str(root/'src'))
from research_lab.engine import verify_stage_ticket
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
verify_stage_ticket(a.ticket,protocol_sha256=sha(root/'protocol.json'),adapter='ppo-record',stage=a.stage,adapter_protocol_sha256=sha(a.config))
c=json.loads(a.config.read_text());out=Path(c['output']);out.mkdir(exist_ok=True)
def write(name,obj):
 with (out/name).open('x',encoding='utf-8') as f:json.dump(obj,f,ensure_ascii=False,separators=(',',':'),allow_nan=False)
if a.stage=='validate':
 assert sha(c['checkpoint'])==c['checkpointSha256'] and sha(c['stats'])==c['statsSha256']
 import torch,stable_baselines3,gymnasium
 print('Source hashes and training dependencies validated',flush=True)
elif a.stage=='run':
 sys.path.insert(0,c['source'])
 import numpy as np,torch
 from stable_baselines3 import PPO
 from stable_baselines3.common.vec_env import DummyVecEnv,VecNormalize
 from stable_baselines3.common.monitor import Monitor
 from rocket_landing_control.envs.rocket_env_energy import RocketLandingEnergyEnv
 torch.set_num_threads(2)
 class IgnoredRng:
  def __init__(self,*args):pass
  def __setstate__(self,state):pass
 class StatsUnpickler(pickle.Unpickler):
  def find_class(self,module,name):
   if module=='numpy.random._pickle':return IgnoredRng
   return super().find_class(module,name)
 with open(c['stats'],'rb') as f:stats=StatsUnpickler(f).load()
 env=VecNormalize(DummyVecEnv([lambda:Monitor(RocketLandingEnergyEnv(randomize=True))]),norm_obs=True,norm_reward=True,clip_obs=10.)
 env.obs_rms=stats.obs_rms;env.ret_rms=stats.ret_rms
 records=[];models=[];checks=[]
 class RecordedPPO(PPO):
  def actor(self):return [self.policy.mlp_extractor.policy_net[0],self.policy.mlp_extractor.policy_net[2],self.policy.action_net]
  def export(self):return {'energy':True,'mean':env.obs_rms.mean.tolist(),'variance':env.obs_rms.var.tolist(),'epsilon':env.epsilon,'clip':env.clip_obs,'layers':[{'weight':l.weight.detach().cpu().tolist(),'bias':l.bias.detach().cpu().tolist()} for l in self.actor()]}
  def train(self):
   self.policy.set_training_mode(True)
   obs=torch.tensor(self.rollout_buffer.observations.reshape(-1,7),device=self.device)
   actions=torch.tensor(self.rollout_buffer.actions.reshape(-1,1),device=self.device)
   oldlog=torch.tensor(self.rollout_buffer.log_probs.reshape(-1),device=self.device)
   adv=torch.tensor(self.rollout_buffer.advantages.reshape(-1),device=self.device);adv=(adv-adv.mean())/(adv.std()+1e-8)
   outputs=[]
   hooks=[m.register_forward_hook(lambda m,i,o:outputs.append(o)) for m in [self.policy.mlp_extractor.policy_net[1],self.policy.mlp_extractor.policy_net[3],self.policy.action_net]]
   dist=self.policy.get_distribution(obs);log=dist.log_prob(actions);ratio=torch.exp(log-oldlog)
   loss=-torch.minimum(adv*ratio,adv*torch.clamp(ratio,.8,1.2)).mean()
   params=[q for m in self.actor() for q in [m.weight,m.bias]]
   grad=torch.autograd.grad(loss,params+outputs)
   for h in hooks:h.remove()
   # Independent chain-rule checks over all entries in every layer.
   for l in range(3):
    inp=obs if l==0 else outputs[l-1]
    delta=grad[6+l] if l==2 else grad[6+l]*(1-outputs[l]**2)
    expected=delta.T@inp
    err=float((expected-grad[l*2]).abs().max());checks.append(err);assert err<2e-5,(l,err)
   chosen=list(dict.fromkeys([int(torch.argmax(grad[8].abs()).item()),0,len(obs)//4,len(obs)//2,len(obs)*3//4,len(obs)-1]))
   samples=[]
   for i in chosen:samples.append({'index':i,'inputs':obs[i].tolist(),'action':float(actions[i,0]),'advantage':float(adv[i]),'return':float(self.rollout_buffer.returns.reshape(-1)[i]),'neuronGradient':[g[i].detach().tolist() for g in grad[6:]]})
   gradients=[{'weight':grad[l*2].detach().tolist(),'bias':grad[l*2+1].detach().tolist()} for l in range(3)]
   if not models:models.append(self.export())
   before=self.export()
   super().train()
   models.append(self.export())
   maxdelta=max(float(np.max(np.abs(np.array(x['weight'])-np.array(y['weight'])))) for x,y in zip(before['layers'],models[-1]['layers']))
   assert maxdelta>0 and np.isfinite(maxdelta)
   records.append({'number':len(records)+1,'steps':len(obs),'samples':samples,'gradient':gradients,'policyLoss':float(loss.detach()),'maxWeightChange':maxdelta,'logStdBefore':float(dist.distribution.scale[0,0].log().detach()),'timesteps':self.num_timesteps})
   print('Recorded PPO round',len(records),'max delta',maxdelta,flush=True)
 model=RecordedPPO.load(c['checkpoint'],env=env,device='cpu',custom_objects={'_last_obs':None,'_last_original_obs':None,'_last_episode_starts':None,'ep_info_buffer':None,'ep_success_buffer':None,'observation_space':env.observation_space,'action_space':env.action_space});model.set_random_seed(c['seed']);model.tensorboard_log=None
 initial=model.export()
 model.learn(total_timesteps=2048*c['rounds'],reset_num_timesteps=True,progress_bar=False)
 # The first snapshot represents the exact checkpoint, not a recalibrated normalizer.
 models[0]=initial
 artifact={'schema':1,'source':{'repository':'https://github.com/17362975180/drl-rocket-landing-control','revision':c['revision'],'checkpointSha256':c['checkpointSha256'],'seed':c['seed'],'kind':'checkpoint-continuation','sb3':__import__('stable_baselines3').__version__,'torch':torch.__version__},'config':{'nSteps':2048,'epochs':10,'batchSize':64,'learningRate':.0003,'clipRange':.2,'gamma':.99,'gaeLambda':.95,'gradientMeaning':'full-rollout actor gradient at the beginning of each PPO update; actual Adam update contains all minibatches and epochs','normalization':'VecNormalize updates during collection; recorded inputs are the exact normalized observations supplied to the actor'},'models':models,'rounds':records}
 write('ppo-training.json',artifact);write('chain-rule.json',{'maxError':max(checks),'checks':len(checks)})
 env.close()
elif a.stage=='freeze':write('frozen.json',{'artifact':'ppo-training.json','sha256':sha(out/'ppo-training.json'),'chainRuleSha256':sha(out/'chain-rule.json')})
elif a.stage=='observe':
 frozen=json.loads((out/'frozen.json').read_text());assert sha(out/'ppo-training.json')==frozen['sha256']
 d=json.loads((out/'ppo-training.json').read_text());assert len(d['rounds'])==c['rounds'];assert len(d['models'])==c['rounds']+1
 assert all([[len(l['weight']),len(l['weight'][0])] for l in m['layers']]==[[128,7],[128,128],[1,128]] for m in d['models'])
 assert all(r['maxWeightChange']>0 for r in d['rounds'])
 write('validation.json',{'passed':True,'rounds':len(d['rounds']),'sha256':frozen['sha256'],'chainRule':json.loads((out/'chain-rule.json').read_text())})
elif a.stage=='decide':
 assert json.loads((out/'validation.json').read_text())['passed'];write('decision.json',{'action':'stop','reason':'Finite teaching capture complete; no formal performance experiment requested.'})
elif a.stage=='report':write('report.json',{'purpose':'authentic educational PPO update replay','validation':json.loads((out/'validation.json').read_text()),'performanceClaim':False})
