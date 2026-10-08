import {valueColor} from '../../../lib/design/value-color';
import {formatClassifierNumber as fmt} from '../../../lib/learning/classifier-lesson';
import s from './classifier-lesson.module.css';
export function ValueLegend({value}:{value:number}) {
  return <div className={s.valueLegend} aria-label="数值颜色固定标尺，负二到正二">
    <div><span>数值颜色 · 固定 −2…+2</span><output style={{color:valueColor(value)}}>当前 s = {fmt(value)}</output></div>
    <div className={s.valueBar}><i style={{left:`${(Math.max(-2,Math.min(2,value))+2)*25}%`}}/></div>
    <div><span>−2</span><span>0</span><span>+2</span></div>
    <p>零附近连续变暗；超出标尺时颜色饱和，数字保留真实值。颜色不表示类别或分对、分错。</p>
  </div>;
}
