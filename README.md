# ❤ Coração 3D — Batimento e Ataque Cardíaco

**Site:** https://simuacaodecoracao.vercel.app

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

## Links prontos
| Link | Para quê |
|---|---|
| https://simuacaodecoracao.vercel.app | Uso normal (celular, iPad) |
| https://simuacaodecoracao.vercel.app/?projecao | Projetor/TV: letras grandes e alto contraste |
| https://simuacaodecoracao.vercel.app/?projecao&auto | Projetor rodando sozinho, em ciclo contínuo |

## Apresentar no projetor
- Botão **📽️ Projeção** (ou tecla **P**): letras e números grandes, fundo preto e coração mais claro (o projetor "lava" as cores escuras). Fica salvo para a próxima vez.
- **Passador de slides** funciona: cada clique em "avançar" conduz a apresentação inteira: normal → 6 etapas do infarto → choque → stent → volta ao normal.
- Atalhos: `→`/`Espaço`/`PgDn` avançar • `←`/`PgUp` voltar • `1`–`6` etapa • `N` normal • `D` desfibrilar • `S` stent • `A` automático • `M` som • `L` nomes • `E` elétrico • `R` girar • `F` tela cheia • `H` ajuda.
- **Automático** (botão ⏯ ou tecla `A`): ciclo completo sem parar (repouso → exercício → infarto → choque → stent → recomeça), ótimo para deixar rodando no estande.
- O painel de texto começa escondido (foco na simulação): só o título da etapa aparece sobre o coração. Botão **ℹ️ Texto** ou tecla `T` mostra as explicações completas; o link `?texto` já abre com elas.
- Aperte `F` para tela cheia. O som liga no primeiro clique ou tecla.

## Rodar no computador
```
python3 -m http.server 8000
```
e abra http://localhost:8000
