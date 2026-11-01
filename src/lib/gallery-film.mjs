// 胶片带的空间曲线在两个交叉点分出前后层，齿孔与画格一起沿曲面转弯。
export function filmPattern(){
  const TAU=Math.PI*2;
  function point(t,n=0){
    const dx=-510*Math.sin(t),dy=420*Math.cos(2*t),length=Math.hypot(dx,dy);
    const x=510*Math.cos(t)-dy/length*n,y=210*Math.sin(2*t)+dx/length*n,z=94*Math.sin(t)+Math.sin(t+.5)*n*.65;
    const p=1+z*.00035;return [700+x*p,430+(y*.88+z*.5)*p,z];
  }
  const coords=p=>`${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const polygon=(ps,attrs)=>`<polygon points="${ps.map(coords).join(' ')}" ${attrs}/>`;
  const strips=[];
  for(let i=0;i<180;i++){
    const a=i/180*TAU,b=(i+1.2)/180*TAU,t=(a+b)/2;
    let art=polygon([point(a,-39),point(b,-39),point(b,39),point(a,39)],`fill="color-mix(in srgb,var(--gallery-film-base) ${Math.round(68+Math.sin(t)*16)}%,var(--gallery-film-shade))"`);
    for(const n of [-37,37,-25,25])art+=`<path d="M${coords(point(a,n))}L${coords(point(b,n))}" fill="none" stroke="var(--gallery-film-edge)" stroke-width="${Math.abs(n)>30?1.1:.65}"/>`;
    strips.push({z:point(t)[2],art});
  }
  for(let i=0;i<124;i++){
    const t=(i+.5)/124*TAU,a=t-.009,b=t+.009;let art='';
    for(const n of [-31,31])art+=polygon([point(a,n-2.5),point(b,n-2.5),point(b,n+2.5),point(a,n+2.5)],'fill="var(--gallery-paper)" stroke="var(--gallery-film-edge)" stroke-width=".45"');
    strips.push({z:point(t)[2]+.1,art});
  }
  for(let i=0;i<25;i++){
    const t=i/25*TAU,a=t+.013,b=t+TAU/25-.013;
    strips.push({z:point((a+b)/2)[2]+.15,art:polygon([point(a,-23),point(b,-23),point(b,23),point(a,23)],'fill="var(--gallery-film-frame)" fill-opacity=".35" stroke="var(--gallery-film-edge)" stroke-width=".8"')});
  }
  return `<svg viewBox="0 0 1400 860" role="presentation" xmlns="http://www.w3.org/2000/svg"><g>${strips.sort((a,b)=>a.z-b.z).map(s=>s.art).join('')}</g></svg>`;
}
