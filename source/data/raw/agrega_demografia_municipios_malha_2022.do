********************************************************************************
* Projeto: Censos Demograficos 2010 e 2022
* Objetivo: agregar a demografia por setor censitario em municipios definidos
*           pela malha municipal de 2022.
*
* Fontes:
* 1. Censo_Demografia_Setores_2010.dta
* 2. Agregados_por_setores_demografia_BR(1).xlsx
* 3. Historico_formacao_Setores_Censitarios_2010_2022.xlsx
*
* Metodo:
* - 2022: soma direta dos setores pelo codigo municipal (7 primeiros digitos).
* - 2010: o historico liga cada setor de 2022 ao setor antecedente de 2010.
*   A relacao e muitos-para-muitos: um setor de 2022 pode ter varios setores
*   antecedentes, e um setor de 2010 pode gerar varios setores de 2022.
*   Repeticoes exatas do mesmo par 2022-2010 sao eliminadas.
* - Quando um setor de 2022 possui varios antecedentes de 2010, sua populacao
*   de 2022 e dividida igualmente entre esses antecedentes apenas para formar
*   a massa populacional usada no calculo dos pesos.
*   Quando um setor de 2010 corresponde a apenas um municipio de 2022, 100%
*   de seus moradores sao atribuidos a esse municipio.
* - Quando um setor de 2010 alcança mais de um municipio de 2022, seus valores
*   sao rateados segundo a populacao residente de 2022 dos setores descendentes.
*   Se todos os descendentes tiverem populacao zero ou ausente, usa-se a
*   proporcao do numero de setores descendentes.
*
* Diagnostico nas bases fornecidas em 18/09/2026:
* - 489.735 linhas no historico; 485.121 pares 2022-2010 distintos.
* - 12.894 setores de 2022 possuem mais de um antecedente de 2010.
* - 310.114 setores com dados em 2010; todos encontrados no historico.
* - 2.184 setores de 2010 associados a mais de um municipio de 2022.
* - Esses setores continham 1.181.513 moradores em 2010.
*
* Importante:
* - O rateio dos setores que cruzam municipios e uma aproximacao espacial.
* - Para que todos os municipios tenham valores numericos e para preservar a
*   soma observada na tabela de origem, celulas setoriais suprimidas (X/missing)
*   contribuem zero somente na operacao de agregacao. Isso nao recupera o valor
*   sigiloso: flag_supressao e n_celulas_suprimidas identificam os municipios
*   afetados, cujos totais devem ser interpretados como soma observada.
* - A base municipal de 2010 pode conter valores fracionarios por causa do
*   rateio. Nao arredondar antes das analises para preservar os totais.
********************************************************************************

version 16.0
clear all
set more off
set varabbrev off

********************************************************************************
* 1. CAMINHOS
********************************************************************************

global ROOT ///
    "H:\Meu Drive\IICA 2\MIDR 2026-2027\P3 - OBJ 2 e 3"

global BASE2010 ///
    "${ROOT}/Censo_Demografia_Setores_2010.dta"

global BASE2022 ///
    "${ROOT}/Agregados_por_setores_demografia_BR.xlsx"

global HISTORICO ///
    "${ROOT}/Historico_formacao_Setores_Censitarios_2010_2022.xlsx"

global SAIDA2010 ///
    "${ROOT}/Censo_Demografia_Municipios_2010_malha2022.dta"

global SAIDA2022 ///
    "${ROOT}/Censo_Demografia_Municipios_2022_malha2022.dta"

capture confirm file "${BASE2010}"
if _rc {
    display as error "Arquivo nao encontrado: ${BASE2010}"
    exit 601
}
capture confirm file "${BASE2022}"
if _rc {
    display as error "Arquivo nao encontrado: ${BASE2022}"
    exit 601
}
capture confirm file "${HISTORICO}"
if _rc {
    display as error "Arquivo nao encontrado: ${HISTORICO}"
    exit 601
}

********************************************************************************
* 2. PROGRAMAS AUXILIARES
********************************************************************************

capture program drop __converte_numericas
program define __converte_numericas
    version 16.0
    syntax varlist

    foreach variavel of local varlist {
        capture confirm string variable `variavel'
        if !_rc {
            replace `variavel' = strtrim(`variavel')
            replace `variavel' = "" if upper(`variavel') == "X"
            destring `variavel', replace
        }
    }
end


capture program drop __rotulos_demografia
program define __rotulos_demografia
    version 16.0

    label variable ano        "Ano do Censo Demografico"
    label variable cd_mun2022 "Codigo do municipio segundo a malha municipal de 2022"
    label variable v01006     "Populacao residente: total"
    label variable v01031     "Populacao residente de 0 a 4 anos"
    label variable v01032     "Populacao residente de 5 a 9 anos"
    label variable v01033     "Populacao residente de 10 a 14 anos"
    label variable v01034     "Populacao residente de 15 a 19 anos"
    label variable v01035     "Populacao residente de 20 a 24 anos"
    label variable v01036     "Populacao residente de 25 a 29 anos"
    label variable v01037     "Populacao residente de 30 a 39 anos"
    label variable v01038     "Populacao residente de 40 a 49 anos"
    label variable v01039     "Populacao residente de 50 a 59 anos"
    label variable v01040     "Populacao residente de 60 a 69 anos"
    label variable v01041     "Populacao residente de 70 anos ou mais"

    format cd_mun2022 %7s
end


capture program drop __confere_faixas
program define __confere_faixas
    version 16.0

    tempvar soma_faixas
    egen double `soma_faixas' = rowtotal(v01031-v01041)
    generate byte flag_inconsistencia = ///
        (abs(`soma_faixas' - v01006) > 0.000001)

    label variable flag_supressao ///
        "1 = ao menos uma parcela setorial foi suprimida"
    label variable n_celulas_suprimidas ///
        "Numero de celulas setoriais suprimidas nas variaveis agregadas"
    label variable flag_inconsistencia ///
        "1 = soma observada das faixas etarias difere da populacao total"
end


local variaveis_demografia ///
    v01006 v01031 v01032 v01033 v01034 v01035 ///
    v01036 v01037 v01038 v01039 v01040 v01041

tempfile setores2022 pesos2010 municipios2022

********************************************************************************
* 3. CENSO 2022: LEITURA E AGREGACAO DIRETA POR MUNICIPIO
********************************************************************************

display as text _newline "Importando demografia por setor do Censo 2022..."

* Sem firstrow: as variaveis recebem os nomes das colunas do Excel.
* Isso evita depender da capitalizacao dos cabecalhos.
import excel using "${BASE2022}", clear allstring

keep A B AA-AK

rename A  cd_setor2022
rename B  v01006
rename AA v01031
rename AB v01032
rename AC v01033
rename AD v01034
rename AE v01035
rename AF v01036
rename AG v01037
rename AH v01038
rename AI v01039
rename AJ v01040
rename AK v01041

* Exclui a linha de cabecalho, importada como primeira observacao.
drop in 1

replace cd_setor2022 = strtrim(cd_setor2022)
replace cd_setor2022 = substr(cd_setor2022, 1, strlen(cd_setor2022) - 2) ///
    if regexm(cd_setor2022, "^[0-9]+[.]0$")

assert strlen(cd_setor2022) == 15
assert real(cd_setor2022) < .
isid cd_setor2022

__converte_numericas `variaveis_demografia'

* Guarda a populacao de 2022 por setor para construir os pesos de 2010.
preserve
    keep cd_setor2022 v01006
    rename v01006 pop2022_setor
    save `setores2022', replace
restore

generate str7 cd_mun2022 = substr(cd_setor2022, 1, 7)

* Totais nacionais antes da agregacao, usados para conferir preservacao.
matrix totais2022 = J(1, 12, .)
local j = 0
foreach variavel of local variaveis_demografia {
    local ++j
    quietly summarize `variavel', meanonly
    matrix totais2022[1, `j'] = r(sum)
    generate byte __m_`variavel' = missing(`variavel')
}

generate byte __um = 1

collapse (sum) `variaveis_demografia' __m_* ///
    n_setores2022=__um, by(cd_mun2022)

assert _N == 5570
local n_municipios2022 = _N

preserve
    keep cd_mun2022
    save `municipios2022', replace
restore

* Confere que a soma municipal preserva exatamente a soma observada na fonte.
local j = 0
foreach variavel of local variaveis_demografia {
    local ++j
    quietly summarize `variavel', meanonly
    local total_municipios = r(sum)
    display as result "2022 - `variavel': fonte = " ///
        %18.6f el(totais2022, 1, `j') "  municipios = " ///
        %18.6f `total_municipios'
    if abs(`total_municipios' - el(totais2022, 1, `j')) > 0.01 {
        display as error "Falha na preservacao do total de `variavel' em 2022."
        exit 459
    }
}

egen long n_celulas_suprimidas = rowtotal(__m_*)
generate byte flag_supressao = (n_celulas_suprimidas > 0)

* collapse (sum) ignora os missings setoriais, produzindo a soma observada.
* Nao se recoloca missing: uma celula suprimida nao deve apagar o municipio.
drop __m_*

foreach variavel of local variaveis_demografia {
    assert !missing(`variavel')
}

generate int ano = 2022

__rotulos_demografia
__confere_faixas

label variable n_setores2022 ///
    "Numero de setores de 2022 agregados no municipio"

order ano cd_mun2022 `variaveis_demografia' ///
    n_setores2022 flag_supressao n_celulas_suprimidas ///
    flag_inconsistencia

sort cd_mun2022
isid cd_mun2022
format `variaveis_demografia' %15.0fc

label data "Demografia municipal 2022 - municipios da malha de 2022"
notes: Agregacao direta dos setores divulgados no Censo Demografico 2022.
notes: Codigo municipal corresponde aos sete primeiros digitos de CD_setor.
notes: Variaveis demograficas sao somas das celulas setoriais observadas.
notes: Celulas setoriais suprimidas contribuem zero somente na agregacao; consulte flag_supressao e n_celulas_suprimidas.

compress
save "${SAIDA2022}", replace

display as result "Base municipal de 2022 salva em:"
display as result "${SAIDA2022}"
display as result "Municipios em 2022: " _N

********************************************************************************
* 4. HISTORICO SETORIAL: PESOS SETOR 2010 -> MUNICIPIO 2022
********************************************************************************

display as text _newline "Importando historico de formacao dos setores..."

* A = setor divulgado em 2022; AQ = setor antecedente em 2010.
import excel using "${HISTORICO}", clear allstring
keep A AQ
rename A  cd_setor2022
rename AQ cd_setor2010
drop in 1

replace cd_setor2022 = strtrim(cd_setor2022)
replace cd_setor2010 = strtrim(cd_setor2010)
drop if missing(cd_setor2022) | missing(cd_setor2010)

assert strlen(cd_setor2022) == 15
assert strlen(cd_setor2010) == 15
assert real(cd_setor2022) < .
assert real(cd_setor2010) < .

* O historico pode repetir exatamente o mesmo par e tambem pode conter mais
* de um antecedente de 2010 para o mesmo setor de 2022. Somente as repeticoes
* exatas sao eliminadas; antecedentes distintos sao preservados.
quietly count
local n_relacoes_brutas = r(N)
duplicates drop cd_setor2022 cd_setor2010, force
quietly count
local n_relacoes_unicas = r(N)

display as result "Relacoes historicas importadas: `n_relacoes_brutas'"
display as result "Pares setor 2022-setor 2010 distintos: `n_relacoes_unicas'"

isid cd_setor2022 cd_setor2010
bysort cd_setor2022: generate int n_antecedentes2010 = _N

generate str7 cd_mun2022 = substr(cd_setor2022, 1, 7)

* Ha varias linhas por setor de 2022 no historico e apenas uma linha por setor
* na planilha demografica; portanto, a juncao correta e muitos-para-um.
merge m:1 cd_setor2022 using `setores2022', keep(master match) nogen

* Setores ausentes da planilha demografica recebem populacao zero apenas para
* o calculo dos pesos. Isso nao altera os totais demograficos de 2022.
replace pop2022_setor = 0 if missing(pop2022_setor)

* Evita que a populacao de um setor de 2022 seja integralmente repetida para
* cada um de seus antecedentes. Na falta de informacao de area, divide-se a
* populacao igualmente entre os antecedentes distintos.
generate double pop2022_proxy = ///
    pop2022_setor / n_antecedentes2010
generate byte __um = 1

collapse (sum) pop2022_proxy ///
    n_setores_descendentes=__um, by(cd_setor2010 cd_mun2022)

bysort cd_setor2010: egen double pop2022_total = total(pop2022_proxy)
bysort cd_setor2010: egen double n_desc_total = ///
    total(n_setores_descendentes)
bysort cd_setor2010: generate byte n_municipios_destino = _N

generate double peso = pop2022_proxy / pop2022_total ///
    if pop2022_total > 0
replace peso = n_setores_descendentes / n_desc_total ///
    if pop2022_total == 0

generate byte peso_por_pop2022 = (pop2022_total > 0)

bysort cd_setor2010: egen double __soma_peso = total(peso)
assert abs(__soma_peso - 1) < 0.000000001

keep cd_setor2010 cd_mun2022 peso n_municipios_destino ///
    peso_por_pop2022 n_setores_descendentes

sort cd_setor2010 cd_mun2022
isid cd_setor2010 cd_mun2022
save `pesos2010', replace

********************************************************************************
* 5. CENSO 2010: RATEIO E AGREGACAO NA MALHA MUNICIPAL DE 2022
********************************************************************************

display as text _newline "Agregando Censo 2010 nos municipios de 2022..."

use "${BASE2010}", clear
keep cd_setor `variaveis_demografia'
rename cd_setor cd_setor2010

replace cd_setor2010 = strtrim(cd_setor2010)
assert strlen(cd_setor2010) == 15
assert real(cd_setor2010) < .
isid cd_setor2010

__converte_numericas `variaveis_demografia'

* Totais nacionais antes do rateio.
matrix totais2010 = J(1, 12, .)
local j = 0
foreach variavel of local variaveis_demografia {
    local ++j
    quietly summarize `variavel', meanonly
    matrix totais2010[1, `j'] = r(sum)
}

merge 1:m cd_setor2010 using `pesos2010'

* Descarta setores do historico sem registro na base demografica de 2010.
drop if _merge == 2

* Salvaguarda para eventual setor demografico sem registro no historico:
* mantem o municipio original e marca o caso para auditoria.
generate byte setor_sem_historico = (_merge == 1)
replace cd_mun2022 = substr(cd_setor2010, 1, 7) ///
    if setor_sem_historico
replace peso = 1 if setor_sem_historico
replace n_municipios_destino = 1 if setor_sem_historico
replace peso_por_pop2022 = . if setor_sem_historico
replace n_setores_descendentes = . if setor_sem_historico
drop _merge

assert !missing(cd_mun2022)
assert !missing(peso)

generate byte setor_rateado = (n_municipios_destino > 1)
generate byte setor_peso_contagem = ///
    (peso_por_pop2022 == 0 & setor_sem_historico == 0)
generate double pop2010_rateada = ///
    v01006 * peso if setor_rateado == 1
replace pop2010_rateada = 0 if setor_rateado == 0

foreach variavel of local variaveis_demografia {
    generate byte __m_`variavel' = missing(`variavel')
    recast double `variavel'
    replace `variavel' = `variavel' * peso
}

generate byte __um = 1

collapse (sum) `variaveis_demografia' pop2010_rateada __m_* ///
    n_setores2010=__um ///
    n_setores_rateados=setor_rateado ///
    n_setores_peso_contagem=setor_peso_contagem ///
    n_setores_sem_historico=setor_sem_historico, by(cd_mun2022)

* Garante a mesma lista de municipios da base de 2022. Em eventual municipio
* sem contribuicao de setor de 2010, inclui-se uma linha zerada; isso mantem os
* totais nacionais e evita que o municipio desapareca da base final.
merge 1:1 cd_mun2022 using `municipios2022'
assert _merge != 1

foreach variavel of local variaveis_demografia {
    replace `variavel' = 0 if _merge == 2
    replace __m_`variavel' = 0 if _merge == 2
}
foreach variavel in pop2010_rateada n_setores2010 n_setores_rateados ///
    n_setores_peso_contagem n_setores_sem_historico {
    replace `variavel' = 0 if _merge == 2
}
drop _merge

assert _N == `n_municipios2022'

* Confere que os pesos preservaram todos os totais nacionais de 2010.
local j = 0
foreach variavel of local variaveis_demografia {
    local ++j
    quietly summarize `variavel', meanonly
    local total_municipios = r(sum)
    display as result "2010 - `variavel': fonte = " ///
        %18.6f el(totais2010, 1, `j') "  municipios = " ///
        %18.6f `total_municipios'
    if abs(`total_municipios' - el(totais2010, 1, `j')) > 0.01 {
        display as error "Falha na preservacao do total de `variavel' em 2010."
        exit 459
    }
}

egen long n_celulas_suprimidas = rowtotal(__m_*)
generate byte flag_supressao = (n_celulas_suprimidas > 0)

* Mantem a soma das parcelas observadas, sem apagar o municipio inteiro.
drop __m_*

foreach variavel of local variaveis_demografia {
    assert !missing(`variavel')
}

generate double pct_pop2010_rateada = ///
    100 * pop2010_rateada / v01006 if v01006 > 0
replace pct_pop2010_rateada = 0 if v01006 == 0
assert !missing(pct_pop2010_rateada)
generate int ano = 2010

__rotulos_demografia
__confere_faixas

label variable n_setores2010 ///
    "Numero de setores de 2010 com contribuicao para o municipio"
label variable n_setores_rateados ///
    "Setores de 2010 divididos entre dois ou mais municipios de 2022"
label variable n_setores_peso_contagem ///
    "Setores de 2010 rateados pelo numero de setores descendentes"
label variable n_setores_sem_historico ///
    "Setores de 2010 sem correspondencia no historico setorial"
label variable pop2010_rateada ///
    "Populacao de 2010 proveniente de setores rateados"
label variable pct_pop2010_rateada ///
    "Percentual da populacao municipal de 2010 proveniente de rateio"

order ano cd_mun2022 `variaveis_demografia' ///
    n_setores2010 n_setores_rateados n_setores_peso_contagem ///
    n_setores_sem_historico ///
    pop2010_rateada pct_pop2010_rateada ///
    flag_supressao n_celulas_suprimidas flag_inconsistencia

sort cd_mun2022
isid cd_mun2022
format `variaveis_demografia' pop2010_rateada %15.3fc
format pct_pop2010_rateada %9.3f

label data "Demografia municipal 2010 compatibilizada com a malha de 2022"
notes: Setores de 2010 foram associados aos municipios definidos pela malha de 2022.
notes: Pares 2022-2010 duplicados no historico foram eliminados antes dos pesos.
notes: Para setor de 2022 com varios antecedentes, a populacao-base foi dividida igualmente entre eles.
notes: Setores que atravessam municipios foram rateados pela populacao de 2022 dos setores descendentes.
notes: O mesmo peso do total populacional foi aplicado a todas as faixas etarias de cada setor de 2010.
notes: Na ausencia de populacao nos descendentes, o peso usa o numero de setores descendentes.
notes: Valores fracionarios decorrem do rateio e nao devem ser arredondados antes das analises.
notes: Variaveis demograficas sao somas das celulas setoriais observadas.
notes: Celulas setoriais suprimidas contribuem zero somente na agregacao; consulte flag_supressao e n_celulas_suprimidas.

compress
save "${SAIDA2010}", replace

display as result "Base municipal de 2010 salva em:"
display as result "${SAIDA2010}"
display as result "Municipios com populacao atribuida em 2010: " _N

summarize pct_pop2010_rateada, detail
tabulate flag_supressao, missing
tabulate flag_inconsistencia, missing

********************************************************************************
* FIM
********************************************************************************
