// Etapas da simulação do ataque cardíaco (infarto agudo do miocárdio).
// Os valores são metas: a simulação faz a transição suave entre eles.

export const BASE = {
  hr: 72, sys: 120, dia: 80, spo2: 98,
  plaque: 0.15, clot: 0, stent: 0, flow: 1,
  isch: 0, necro: 0, st: 0, qwave: 0, fib: 0, contract: 1,
  cam: 'front', alarm: false,
};

export const STAGES = [
  {
    id: 'saudavel',
    title: 'Coração saudável',
    tag: 'Normal',
    tagClass: 'ok',
    body: `
      <p>O coração é um músculo do tamanho de um punho fechado que bate cerca de
      <b>100 mil vezes por dia</b>. As <b>artérias coronárias</b> (os vasos vermelhos sobre
      a superfície) levam oxigênio para o próprio músculo do coração.</p>
      <p>Observe o <b>ECG</b>: cada batimento tem a onda <b>P</b> (átrios), o complexo
      <b>QRS</b> (ventrículos) e a onda <b>T</b> (recuperação).</p>`,
    set: { hr: 72, sys: 120, dia: 80, spo2: 98, plaque: 0.15 },
  },
  {
    id: 'placa',
    title: 'Aterosclerose: a placa de gordura',
    tag: 'Anos de evolução',
    tagClass: 'warn',
    body: `
      <p>Ao longo de anos, <b>colesterol LDL</b>, células inflamatórias e cálcio se acumulam
      na parede da artéria formando uma <b>placa de ateroma</b> (amarela no detalhe da artéria).</p>
      <p>A passagem do sangue fica mais estreita, mas a pessoa geralmente <b>não sente nada</b>.
      Fatores de risco: cigarro, pressão alta, diabetes, colesterol alto, sedentarismo,
      obesidade, estresse e histórico familiar.</p>`,
    set: { hr: 76, sys: 132, dia: 86, plaque: 0.85, cam: 'lad' },
  },
  {
    id: 'trombo',
    title: 'A placa se rompe e forma um coágulo',
    tag: 'Minuto 0',
    tagClass: 'danger',
    body: `
      <p>A capa da placa <b>se rompe</b>. O corpo "acha" que é um machucado e as
      <b>plaquetas</b> e a <b>fibrina</b> formam um <b>coágulo (trombo)</b> no local.</p>
      <p>O coágulo <b>entope totalmente</b> a artéria descendente anterior (DA) — a artéria mais
      importante do coração, apelidada de <i>"artéria da viúva"</i>. Depois do bloqueio, o sangue
      <b>não passa mais</b>.</p>`,
    set: { hr: 88, sys: 135, dia: 88, plaque: 0.85, clot: 1, flow: 0, cam: 'lad' },
  },
  {
    id: 'isquemia',
    title: 'Isquemia: o músculo fica sem oxigênio',
    tag: 'Primeiros minutos',
    tagClass: 'danger',
    body: `
      <p>A região que dependia da DA (parede da frente e ponta do coração) fica
      <b>arroxeada</b> e <b>para de contrair</b> — veja que ela até estufa enquanto o resto aperta.</p>
      <p>No ECG aparece o <b>supradesnivelamento do segmento ST</b>, o sinal clássico de infarto.</p>
      <div class="symptoms">
        <b>Sintomas:</b>
        <ul>
          <li>Dor ou aperto forte no peito (mais de 20 min)</li>
          <li>Dor que irradia para o braço esquerdo, pescoço, mandíbula ou costas</li>
          <li>Falta de ar, suor frio, náusea, tontura</li>
        </ul>
        <div class="call">📞 Ligue <b>192 (SAMU)</b> imediatamente!</div>
      </div>`,
    set: { hr: 108, sys: 148, dia: 96, spo2: 95, plaque: 0.85, clot: 1, flow: 0, isch: 1, st: 0.38, contract: 0.85, cam: 'zone', alarm: true },
  },
  {
    id: 'infarto',
    title: 'Infarto: as células morrem (necrose)',
    tag: '20 a 40 minutos',
    tagClass: 'danger',
    body: `
      <p>Sem oxigênio, as células do músculo cardíaco começam a <b>morrer</b> depois de
      20–40 minutos. A área fica <b>pálida e manchada</b>. Esse tecido morto <b>não se regenera</b>:
      vira uma cicatriz que não contrai.</p>
      <p>No ECG surge a <b>onda Q patológica</b>. A pressão cai porque o coração bombeia menos sangue.</p>
      <p class="hl">"Tempo é músculo": a cada minuto sem tratamento, mais músculo morre.</p>`,
    set: { hr: 116, sys: 98, dia: 64, spo2: 93, plaque: 0.85, clot: 1, flow: 0, isch: 0.6, necro: 1, st: 0.28, qwave: 1, contract: 0.7, cam: 'zone', alarm: true },
  },
  {
    id: 'fv',
    title: 'Parada cardíaca: fibrilação ventricular',
    tag: 'EMERGÊNCIA',
    tagClass: 'danger blink',
    body: `
      <p>O músculo lesionado gera impulsos elétricos desorganizados. Os ventrículos apenas
      <b>tremem</b> (fibrilam) e <b>não bombeiam sangue</b>. A pressão vai a zero e a pessoa desmaia.</p>
      <p>É a principal causa de <b>morte súbita</b>. Sem tratamento, o cérebro sofre lesão em
      poucos minutos.</p>
      <p class="hl">O que fazer: <b>massagem cardíaca (RCP)</b> — 100 a 120 compressões por minuto —
      e usar o <b>desfibrilador (DEA)</b> o quanto antes. Toque em <b>⚡ Desfibrilar</b>.</p>`,
    set: { hr: 0, sys: 0, dia: 0, spo2: 0, plaque: 0.85, clot: 1, flow: 0, isch: 0.6, necro: 1, st: 0, qwave: 1, fib: 1, contract: 0, cam: 'front', alarm: true },
  },
];

export const AFTER_SHOCK = {
  id: 'choque',
  title: 'Choque aplicado: o ritmo voltou!',
  tag: 'Ritmo recuperado',
  tagClass: 'warn',
  body: `
    <p>O choque do desfibrilador <b>"reinicia" a eletricidade</b> do coração de uma vez só.
    O nó sinusal (o marca-passo natural) volta a comandar os batimentos.</p>
    <p>Mas a artéria <b>continua entupida</b>! Agora é preciso abrir a artéria no hospital.
    Toque em <b>💉 Angioplastia com stent</b>.</p>`,
  set: { hr: 102, sys: 100, dia: 66, spo2: 94, plaque: 0.85, clot: 1, flow: 0, isch: 0.6, necro: 1, st: 0.25, qwave: 1, fib: 0, contract: 0.7, cam: 'front', alarm: false },
};

export function stentStage(necroLevel) {
  const early = necroLevel < 0.2;
  return {
    id: 'stent',
    title: 'Tratamento: angioplastia com stent',
    tag: early ? 'Tratado a tempo!' : 'Artéria aberta',
    tagClass: 'ok',
    body: `
      <p>No hospital, um cateter é levado até o coração por uma artéria do punho ou da virilha.
      Um <b>balão</b> esmaga a placa e um <b>stent</b> (uma malha de metal) é deixado para manter
      a artéria <b>aberta</b>. O sangue volta a passar!</p>
      ${early
        ? '<p class="hl ok">Como o tratamento foi rápido, o músculo foi salvo e <b>não houve necrose</b>. Por isso cada minuto conta!</p>'
        : '<p class="hl">O músculo que estava só isquêmico se recupera, mas a parte que morreu virou <b>cicatriz</b> e não contrai mais — o coração fica mais fraco (insuficiência cardíaca).</p>'}
      <div class="symptoms prevent">
        <b>Como prevenir:</b>
        <ul>
          <li>Não fumar</li>
          <li>Praticar atividade física (150 min por semana)</li>
          <li>Alimentação com frutas, verduras e pouca gordura saturada, açúcar e sal</li>
          <li>Controlar pressão, glicose e colesterol</li>
          <li>Dormir bem e controlar o estresse</li>
        </ul>
      </div>`,
    set: {
      hr: early ? 80 : 88, sys: early ? 118 : 108, dia: early ? 76 : 70, spo2: 97,
      plaque: 0.3, clot: 0, stent: 1, flow: 1, isch: 0, necro: early ? 0 : 0.8,
      st: early ? 0.04 : 0.08, qwave: early ? 0 : 1, fib: 0, contract: early ? 0.95 : 0.8,
      cam: 'lad', alarm: false,
    },
  };
}

export const FACTS = [
  'O coração bombeia cerca de 7.000 litros de sangue por dia.',
  'Em uma vida, o coração bate mais de 2,5 bilhões de vezes.',
  'O ventrículo esquerdo tem a parede mais grossa: ele empurra o sangue para o corpo todo.',
  'O barulho "tum-tá" são as válvulas se fechando.',
  'O coração tem seu próprio marca-passo: o nó sinoatrial.',
  'As doenças do coração são a principal causa de morte no Brasil e no mundo.',
  'Mulheres, idosos e diabéticos podem ter sintomas de infarto diferentes: cansaço, falta de ar e enjoo.',
  'Com RCP e desfibrilador nos primeiros 3–5 minutos, a chance de sobreviver pode passar de 50%.',
];
