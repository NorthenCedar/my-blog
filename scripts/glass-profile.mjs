/** 参照Willow照片页的圆角矩形距离场与边缘曲线，位移朝向镜片内部。 */
export function glassVector(x,y,width,height){
  const radius=height/2,px=x-width/2,py=y-radius;
  const qx=Math.abs(px)-width/2+radius,qy=Math.abs(py)-height/2+radius;
  const distance=Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-radius;
  const edge=Math.max(0,Math.min(1,1+distance/(radius*.71)));
  const nx=px/(width/2),ny=py/radius,length=Math.hypot(nx,ny);
  if(length<1e-9)return [0,0];
  const amount=Math.pow(edge,2.15);
  return [-nx/length*amount,-ny/length*amount];
}
