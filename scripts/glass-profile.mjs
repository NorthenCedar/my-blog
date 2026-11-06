/** 与参考站的圆角矩形距离场一致：只在轮廓内沿局部法线向内采样。 */
export function glassVector(x,y,width,height){
  const radius=height/2,px=x-width/2,py=y-radius;
  const qx=Math.abs(px)-width/2+radius,qy=Math.abs(py)-height/2+radius;
  const ax=Math.max(qx,0),ay=Math.max(qy,0),length=Math.hypot(ax,ay);
  const distance=Math.min(Math.max(qx,qy),0)+length-radius;
  if(distance>0)return [0,0];
  const edge=Math.max(0,Math.min(1,1+distance/(radius*.71))),amount=Math.pow(edge,2.15);
  if(!amount||length<1e-9)return [0,0];
  return [-Math.sign(px)*ax/length*amount,-Math.sign(py)*ay/length*amount];
}
