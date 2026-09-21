import { graphic } from 'echarts';

const overlaps=(a,b,gap=4)=>a.x < b.x+b.width+gap && a.x+a.width+gap>b.x && a.y<b.y+b.height+gap && a.y+a.height+gap>b.y;
const bounds=text=>{const rect=text.getBoundingRect().clone();rect.applyTransform(text.getComputedTransform());return rect;};

/** Separate actual measured label rectangles in output pixels; never shrink or delete text. */
export function placeScreenLabels(chart,width,height,frame) {
  const labels=[];
  chart.getModel().eachSeries(series=>{
    if(series.name!=='__administrative_labels__')return;
    const data=series.getData();
    for(let i=0;i<data.count();i++){
      const host=data.getItemGraphicEl(i);
      const owner=host?.getTextContent()?host:host?.children?.().find(child=>child.getTextContent?.());
      const text=owner?.getTextContent();
      if(text && !text.ignore)labels.push({owner,text,rect:bounds(text)});
    }
  });
  const limit={left:frame?.left??width*0.05,right:frame?.right??width*0.84,top:frame?.top??height*0.12,bottom:height-(frame?.bottom??height*0.04)};
  const placed=[];let shifted=0;
  for(const label of labels){
    const origin=label.rect;
    let target;
    const fits=r=>r.x>=limit.left && r.x+r.width<=limit.right && r.y>=limit.top && r.y+r.height<=limit.bottom && !placed.some(p=>overlaps(r,p));
    if(fits(origin))target=origin;
    for(let radius=1;!target && radius<70;radius++){
      const distance=radius*Math.max(6,origin.height*0.6);
      for(let angle=0;angle<32;angle++){
        const dx=Math.cos(angle*Math.PI/16)*distance;
        const dy=Math.sin(angle*Math.PI/16)*distance;
        const r={x:Math.max(limit.left,Math.min(limit.right-origin.width,origin.x+dx)),y:origin.y+dy,width:origin.width,height:origin.height};
        if(fits(r)){target=r;break;}
      }
    }
    if(!target)throw new Error('Labels do not fit without overlap; increase canvas size or use a regional inset');
    const dx=target.x-origin.x,dy=target.y-origin.y;
    const matrix=Array.from(label.text.getComputedTransform());
    matrix[4]+=dx;matrix[5]+=dy;
    label.owner.removeTextContent();
    label.text.setLocalTransform(matrix);
    label.text.z=10;
    chart.getZr().add(label.text);
    if(Math.abs(dx)+Math.abs(dy)>0.5){
      const anchor=[origin.x+origin.width/2,origin.y+origin.height/2];
      const end=[Math.max(target.x,Math.min(target.x+target.width,anchor[0])),Math.max(target.y,Math.min(target.y+target.height,anchor[1]))];
      chart.getZr().add(new graphic.Polyline({silent:true,z:9,shape:{points:[anchor,end]},style:{stroke:'#64748B',lineWidth:1,fill:null}}));
      shifted++;
    }
    placed.push(target);
  }
  chart.getZr().refreshImmediately();
  const finalRects=labels.map(l=>bounds(l.text));
  let collisions=0;
  for(let i=0;i<finalRects.length;i++)for(let j=i+1;j<finalRects.length;j++)if(overlaps(finalRects[i],finalRects[j],0))collisions++;
  if(collisions)throw new Error(`Export refused: ${collisions} overlapping label rectangles`);
  return {count:labels.length,shifted,overlaps:collisions};
}
