# Integração de migração — 12/10/2026

## Implementação

- Preservados título, subtítulo, identidade visual, mapas locais, 5.570 municípios, 508 chaves de RGI PNDR, indicadores demográficos, regras de dinamismo, exportação demográfica e abas anteriores.
- Acrescentadas dez opções migratórias (cinco indicadores × dois censos) ao Panorama, aos mapas e aos dois eixos da dispersão.
- Nova aba Panorama Migração com ano selecionável, síntese e boxes para cada combinação observada de papel, tipo/tipo_migracao e contraparte.
- Filtros de papel, tipo, tipo de migração e contraparte, combinados com geografia, PNDR e dinamismo. Tipo e tipo de migração sincronizados porque as colunas são equivalentes nas fontes.
- Agregados incluem saldo líquido em pessoas e em % dos residentes 5+, com decomposição das contribuições por categoria, sem tabela extensa de microperfis.
- Carregamento sob demanda dos perfis locais gzip. Os Excel permanecem como fontes no código, fora do carregamento da interface.
- Asteriscos nas médias e percentuais reagrupados, com explicação dos pesos e das aproximações. Metodologia ampliada com DataZoom e processamento Stata de referência.

## Validação realizada

- Compilação de produção e verificação TypeScript concluídas.
- Extração integral das duas abas usadas em cada Excel; 57.891 linhas de perfil em 2010 e 61.130 em 2022.
- Reconciliação de todos os perfis de imigração/emigração com as contagens de cada município.
- Reprodução das quatro taxas e da eficácia das planilhas onde os denominadores existem.
- Igualdade nacional entre entradas e saídas: 13.194.730,137159 em 2010; 12.875.221,824623 em 2022, em cada papel.
- Testes de somas, denominadores ausentes, seleção de papel/tipo/contraparte, taxas recalculadas, ponderação por renda e setor, saldo zero e participações assinadas por UF.
- Testes das classes por decis e regras 5+5 e 1+9, zero neutro e valor ausente.
- Auditoria das bases demográficas contra os DTA e da correspondência PNDR. Reconstrução dos indicadores demográficos produz dados idênticos aos do pacote anterior.
- Interface de produção conferida em navegador: indicadores nos dois anos; perfis e combinação Mato Grosso/imigrante/outra macrorregião/Nordeste; mapa com 508 unidades e zoom; eixos migratórios; agregados Brasil e recorte de Mato Grosso; participação indefinida em saldo zero.
- A publicação remota não foi alterada; este pacote deve substituir os arquivos da raiz.

## Limitações identificadas, preservadas e documentadas

1. 2010 contém 5.565 municípios. Cinco ausentes não foram imputados.
2. Em 2022, cinco municípios têm população 5+ ausente e saídas presentes. Taxas populacionais e saldo % são ausentes nesses municípios e agregados que os contenham. Eficácia e contagens são mantidas.
3. As planilhas migratórias têm 510 RGIs; a tabela PNDR usa 508 códigos porque duas chaves reúnem regiões homônimas de UFs diferentes. Os 19 códigos municipais estão na auditoria JSON. O agrupamento segue a PNDR solicitada; a classificação do tipo de migração mantém a definição da origem.
4. As médias exportadas não contêm todos os denominadores válidos específicos. Renda e setores usam os denominadores exportados; outras medidas usam migrantes como peso, com a aproximação explicada pelo asterisco.
5. Fluxos municipais internos ao agregado permanecem no volume e se cancelam no saldo quando ambas as pontas estão no recorte. Os números não representam exclusivamente travessias da fronteira do agregado.
6. O programa Stata fornecido foi consultado; não houve execução dos microdados originais nem inferência de código de 2022 além da réplica declarada pelo usuário.
