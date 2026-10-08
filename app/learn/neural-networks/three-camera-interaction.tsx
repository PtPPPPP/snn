"use client";
import {useEffect,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {CameraControls,CameraControlsImpl,Html} from '@react-three/drei';
export type CameraAction={id:number;kind:'reset'|'in'|'out'|'left'|'right'|'up'|'down'};
export type Interaction={enabled:boolean;action:CameraAction;onInteract?:()=>void};
export function SceneLabel({position,children}:{position:[number,number,number];children:React.ReactNode}){return <Html position={position} center style={{pointerEvents:'none',whiteSpace:'nowrap',color:'#bcbcb5',font:'12px "Geist Mono", monospace',background:'rgba(21,21,21,.75)',padding:'1px 3px'}} zIndexRange={[4,0]}>{children}</Html>;}
export function CameraInteraction({enabled,action,onInteract,target,syncKey='fixed'}:Interaction&{target:[number,number,number];syncKey?:string}){
 const ref=useRef<CameraControls>(null),camera=useThree(s=>s.camera),invalidate=useThree(s=>s.invalidate),initial=useRef(false),lastAction=useRef(0);
 const tx=target[0],ty=target[1],tz=target[2];
 useEffect(()=>{const control=ref.current;if(!control)return;control.updateCameraUp();control.setLookAt(camera.position.x,camera.position.y,camera.position.z,tx,ty,tz,false);control.saveState();initial.current=true;invalidate();},[camera,tx,ty,tz,syncKey,invalidate]);
 useEffect(()=>{const control=ref.current;if(!control||!initial.current||action.id===lastAction.current)return;lastAction.current=action.id;const animate=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(action.kind==='reset'){control.normalizeRotations();control.reset(animate);}else if(['left','right','up','down'].includes(action.kind)){control.rotate(action.kind==='left'?-.18:action.kind==='right'?.18:0,action.kind==='up'?-.15:action.kind==='down'?.15:0,animate);}else control.zoomTo(Math.max(.65,Math.min(2.2,camera.zoom*(action.kind==='in'?1.2:1/1.2))),animate);invalidate();},[action,camera,invalidate]);
 const A=CameraControlsImpl.ACTION;
 return <CameraControls ref={ref} makeDefault enabled={enabled} smoothTime={.18} draggingSmoothTime={.1} minZoom={.65} maxZoom={2.2} minPolarAngle={.1} maxPolarAngle={Math.PI-.1} mouseButtons={{left:A.ROTATE,middle:A.NONE,right:A.NONE,wheel:A.ZOOM}} touches={{one:A.TOUCH_ROTATE,two:A.TOUCH_ZOOM,three:A.NONE}} onControlStart={onInteract}/>;
}
