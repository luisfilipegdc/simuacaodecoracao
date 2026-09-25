# ❤ Coração 3D — Batimento e Ataque Cardíaco

Simulação 3D realista do coração humano para feira de ciências.

- **Batimento normal**: sístole atrial, sístole ventricular (com torção) e diástole; impulso elétrico percorrendo o coração; sangue fluindo nas coronárias; ECG, oximetria e sons "tum-tá".
- **Ataque cardíaco** (passo a passo): placa de gordura → coágulo na artéria DA → isquemia (supra de ST) → necrose (onda Q) → fibrilação ventricular → desfibrilação → angioplastia com stent.
- **Efeitos sonoros** (sintetizados, sem arquivos): bulhas "TUM-TÁ" realistas, galope B4 no coração infartado, sopro do fluxo de sangue, bipe do monitor (o tom cai quando a SpO₂ cai), alarmes de prioridade média e alta, placa, ruptura e coágulo, desfibrilador com **voz em português** ("Analisando o ritmo… Afastem-se!"), choque, linha reta, balão e stent.
- Funciona no iPad (toque, pinça para zoom, tela cheia) e **offline** depois da primeira abertura.

## Publicar na Vercel
1. Importe este repositório na Vercel.
2. Framework: **Other** — sem comando de build, diretório raiz `/`.
3. Deploy. Pronto.

## Dicas para o iPad na feira
- Abra o site no Safari, toque em **Compartilhar → Adicionar à Tela de Início**: ele abre em tela cheia, como um app.
- Abra o site uma vez com internet: depois ele funciona sem Wi-Fi.
- O som liga sozinho no **primeiro toque** na tela (exigência do iPad). Para silenciar, toque em 🔊. Desative o modo silencioso do iPad e aumente o volume.
- Numa feira barulhenta, uma caixinha de som Bluetooth ajuda muito.
- Use **⏯ Automático** no modo "Ataque cardíaco" para a apresentação rodar sozinha.

## Rodar no computador
```
python3 -m http.server 8000
```
e abra http://localhost:8000
