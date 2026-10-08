import * as THREE from 'three';
import {facetLight,foldHeight} from './ascii-fold.ts';
import type {Camera} from './opening-demo.ts';
export function createFoldGeometry(subdivisions=64){
 const positions:number[]=[],colors:number[]=[],step=2/subdivisions,color=new THREE.Color();
 for(let i=0;i<subdivisions;i++)for(let j=0;j<subdivisions;j++){
  const u=-1+i*step,v=-1+j*step;
  for(const tri of [[[u,v],[u+step,v],[u+step,v+step]],[[u,v],[u+step,v+step],[u,v+step]]]){
   const value=Math.max(0,Math.min(1,(facetLight(tri.reduce((s,p)=>s+p[0],0)/3,tri.reduce((s,p)=>s+p[1],0)/3)-75)/180));
   color.setRGB(value,value,value,THREE.SRGBColorSpace);
   for(const [x,y]of tri){positions.push(x,y,foldHeight(x,y));colors.push(color.r,color.g,color.b);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function configureClassifierCamera(camera:THREE.OrthographicCamera,view:Camera){
 const {yaw,tilt}=view;
 camera.left=-400/240;camera.right=400/240;camera.top=308/240;camera.bottom=-308/240;camera.near=.1;camera.far=20;
 camera.position.set(-Math.sin(yaw)*Math.sin(tilt)*5,-Math.cos(yaw)*Math.sin(tilt)*5,Math.cos(tilt)*5);
 camera.up.set(Math.sin(yaw)*Math.cos(tilt),Math.cos(yaw)*Math.cos(tilt),Math.sin(tilt));
 camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
export function configureHeroCamera(camera:THREE.OrthographicCamera){
 const verticalScale=Math.hypot(116,116,301),targetZ=(500-790/2)/(301/verticalScale*verticalScale);
 // Preserve the approved u−v screen direction; this illustration uses a reflected horizontal frustum.
 camera.left=952/(2*Math.hypot(220,220));camera.right=-camera.left;
 camera.top=790/(2*verticalScale);camera.bottom=-camera.top;camera.near=.1;camera.far=30;
 camera.position.set(3,3,targetZ+3*232/301);camera.up.set(0,0,1);camera.lookAt(0,0,targetZ);camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
