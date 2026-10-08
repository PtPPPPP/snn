import Link from "next/link";
import { ArrowUpRight } from "./icons";
import { CharacterNetwork } from '../learn/neural-networks/character-network';

const experiments = [
  { number: "01", title: "神经网络基础", description: "从一个神经元，到第一次参数更新。", href: "/learn/neural-networks" },
  { number: "02", title: "回收挑战", description: "亲手控制油门，挑战 AI 驾驶员。", href: "/play/rocket" },
  { number: "03", title: "怎样推理", description: "看高度与速度怎样变成下一步决策。", href: "/play/rocket/explain" },
  { number: "04", title: "怎样学习", description: "从一次反馈，理解网络权重的改变。", href: "/play/rocket/train" },
];

export function LearningLabSection() {
  return (
    <aside className="hero-lab" id="learning-lab" aria-labelledby="learning-lab-title">
      <div className="lab-header">
        <h2 id="learning-lab-title">学习实验室</h2>
        <span>一起动手，把原理看懂</span>
      </div>
      <div className="lab-visual">
          <CharacterNetwork position={2} x={1} y={0} compact/>
      </div>
      <nav className="lab-links" aria-label="首页实验入口">
        {experiments.map(experiment => (
          <Link href={experiment.href} key={experiment.number}>
            <small>{experiment.number}</small>
            <div><h3>{experiment.title}</h3><p>{experiment.description}</p></div>
            <ArrowUpRight />
          </Link>
        ))}
      </nav>
    </aside>
  );
}
