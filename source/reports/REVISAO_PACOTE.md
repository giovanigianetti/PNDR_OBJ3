# Revisão geral do pacote

## Correções
- HTML compilado na raiz e caminhos relativos: publicação direta pela branch; não depende da pasta oculta .github.
- Fontes separados em source; CSS de vendor e configuração PostCSS incluídos, ausentes no ZIP anterior.
- Dependências reduzidas, instalação limpa com npm, lockfile sem caminhos locais.
- 133 regiões intermediárias em lugar de 508 imediatas, conforme o pedido original.
- Shapefiles locais, equivalência de chaves com os GeoJSON e malha simplificada proveniente do OBJ1.
- Mapa inclui variação absoluta e indicadores de 2010; índice não recebe unidade percentual indevida no tooltip.
- Escala negativa corrigida: maior retração corresponde à cor mais intensa; legenda calculada com a mesma função dos polígonos.
- Dispersão exclui métricas ausentes em vez de convertê-las em zero; legenda inclui regiões com múltiplas classes.
- Troca de município para região elimina filtro municipal residual.
- Participação de idosos em 2010 e comparação completa das 11 faixas etárias nos agregados.
- Erros HTTP nos arquivos apresentam mensagem com o caminho, em vez de falha opaca de JSON.

## Verificação dos dados
O script audit.py confrontou cada município e faixa etária com os dois DTA, verificou as fórmulas, a conservação das somas nacionais nos agregados por UF/macrorregião/RGI e a correspondência integral das chaves geográficas. Resultado: PASS; consulte AUDITORIA_GERAL.json.

Somas observadas: 190.755.799 em 2010 e 202.561.627 em 2022. Não são uma certificação de igualdade com os totais oficiais de outras tabelas censitárias. Supressões: 69.674 células em 2010 e 215.615 em 2022 (contagens provenientes das bases municipais, sujeitas ao histórico de agregação/rateio). Diferenças entre soma das faixas e total maiores que 0,01 pessoa: 1.666 municípios em 2010 e 4.774 em 2022. Mantidas e informadas; não forçado fechamento artificial.

## Verificação funcional
- TypeScript sem erros e build de produção concluído.
- Instalação nova de dependências, sem utilizar node_modules do projeto anterior.
- Aplicação compilada servida por HTTP sob /PNDR_OBJ3/ e aberta no navegador.
- Panorama com totais compatíveis com auditoria.
- 5.570 polígonos municipais e 133 polígonos regionais renderizados; mapa inspecionado visualmente.
- Filtros combinados Nordeste + Baixo Dinamismo e dispersão operacional.
- Aba Agregados: tabela Brasil com 11 linhas de faixas etárias e variações.
- Aba Tabela: 133 regiões e botão de exportação habilitado. O acionamento do botão foi testado, mas o navegador remoto não confirmou o evento de download; o recebimento do CSV requer conferência no navegador do usuário. A geração CSV mantém BOM UTF-8, separador ponto e vírgula e escaping de aspas.
- Metodologia: razão 684/685 e limitação 60+ visíveis.
- Nenhum erro da aplicação observado; mensagens da extensão do navegador são externas ao painel.

## Limites da certificação
A verificação cobre dados recebidos, cartografia simplificada, compilação e uso em servidor estático local. Não houve alteração ou nova publicação no repositório remoto. Não é validação independente da construção dos DTA a partir dos setores originais, nem recuperação de células sigilosas. A revisão não torna calculável o índice oficial 65+: o painel continua explicitamente em 60+/0–14.
