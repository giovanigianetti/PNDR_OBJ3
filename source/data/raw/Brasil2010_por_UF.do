*=====================================================================*
* BRASIL 2010 — PROCESSAMENTO POR UF
* Adaptacao de Brasil2010.do: somente organizacao da leitura e gravacao.
*
* Mantidas as classificacoes, variaveis, pesos, formulas e abas do Excel.
* Nao monta CENSO10_BR_pes_comp.dta nem duplica todos os migrantes na RAM.
* A mediana continua sendo calculada nos registros individuais de cada
* grupo completo, usando o mesmo collapse (p50) [pw=peso_pess].
*
* Execute o arquivo inteiro. Os intermediarios ficam em saida/por_UF_2010.
* Eles podem ser removidos depois da exportacao bem-sucedida do Excel.
* Validacao estatica e de equivalencia em dados artificiais; sem execucao
* nativa no Stata neste ambiente.
*=====================================================================*

clear all
set more off
set type double

local pasta "G:/Meu Drive/IICA 2/MIDR 2026-2027/P3 - OBJ 2 e 3/Microdados Censos Demográficos"
local projeto "G:/Meu Drive/IICA 2/MIDR 2026-2027/P3 - OBJ 2 e 3/Stata/teste2010"
local apoio "`projeto'/apoio"
local saida "`projeto'/saida"
local excel "`saida'/Migracao_perfil_municipal_2010_1.xlsx"
local intermediarios "`saida'/por_UF_2010"

capture mkdir "`saida'"
capture mkdir "`intermediarios'"

* As duas listas seguem a mesma ordem.
local ufs "RO AC AM RR PA AP TO MA PI CE RN PB PE AL SE BA MG ES RJ SP PR SC RS MS MT GO DF"
local outras "AC AM RR PA AP TO MA PI CE RN PB PE AL SE BA MG ES RJ SP PR SC RS MS MT GO DF"
local codigos "11 12 13 14 15 16 17 21 22 23 24 25 26 27 28 29 31 32 33 35 41 42 43 50 51 52 53"

tempfile geografia geo_origem geo_destino contagens saidas

* Ler apenas as variaveis efetivamente usadas no programa original.
local variaveis "UF codmun mun_mor5anos idade sempre_morou anos_mor_mun pais_mor5anos UF_mor5anos peso_pess rend_total_def trab_rem_sem afast_trab_sem nao_remun pos_ocup_sem ativ2010 rend_todos_trab_def sexo raca"

* Variaveis individuais necessarias para reproduzir os mesmos perfis.
local perfil "peso_pess idade renda_ind renda_trabalho setor pct_mulheres pct_branca pct_preta pct_amarela pct_parda pct_indigena pct_5a14 pct_15a24 pct_25a39 pct_40a59 pct_60mais pct_ocupados pct_primario pct_industria pct_servicos"

*=====================================================================*
* 1. PREPARAR UMA UNICA VEZ A CORRESPONDENCIA MUNICIPIO-RGI
*=====================================================================*

import delimited "`apoio'/territorios_2022.csv", ///
    clear varnames(1) stringcols(_all) encoding(utf8)

destring mun rgi uf macro, replace

keep mun nome_mun rgi nome_rgi uf macro
save `geografia'

* Uma copia da correspondencia para o municipio de origem.
rename (mun nome_mun rgi nome_rgi uf macro) ///
       (mun_o nome_o rgi_o nome_rgi_o uf_o macro_o)

save `geo_origem'

* Outra copia para o municipio de destino.
rename (mun_o nome_o rgi_o nome_rgi_o uf_o macro_o) ///
       (mun_d nome_d rgi_d nome_rgi_d uf_d macro_d)

save `geo_destino'

*=====================================================================*
* 2. PROCESSAR UMA UF DE RESIDENCIA POR VEZ
*=====================================================================*

local posicao = 0
foreach uf of local ufs {

    local posicao = `posicao' + 1
    local codigo : word `posicao' of `codigos'

    display as result "Processando os microdados de `uf'..."

    use `variaveis' using "`pasta'/CENSO10_`uf'_pes_comp.dta", clear

    * Mesmos valores do peso; double evita arredondar somas intermediarias.
    recast double peso_pess

    *---------------------------------------------------------------*
    * Mesmas regras de origem, destino, migracao e perfil do original.
    *---------------------------------------------------------------*

    keep if idade >= 5 & idade < .

    gen long mun_d = codmun

    gen long mun_o = mun_mor5anos ///
        if inrange(mun_mor5anos, 1100000, 5399999)

    merge m:1 mun_d using `geo_destino', keep(master match) nogen
    merge m:1 mun_o using `geo_origem', keep(master match) nogen

    label define macro_lbl ///
        1 "Norte" ///
        2 "Nordeste" ///
        3 "Sudeste" ///
        4 "Sul" ///
        5 "Centro-Oeste", replace

    label values macro_o macro_lbl
    label values macro_d macro_lbl


    *=====================================================================*
    * 4. CLASSIFICAR A MIGRACAO
    *
    * 0 = Mesmo municipio na data fixa.
    * 1 = Outro municipio da mesma RGI.
    * 2 = Outra RGI da mesma UF.
    * 3 = Outra UF da mesma macrorregiao.
    * 4 = Outra macrorregiao.
    * 5 = Origem no exterior identificada.
    * 9 = Informacao insuficiente para classificacao.
    *
    * O Data Zoom descarta o quesito original V0626.
    * Por isso, origem em branco nao e automaticamente "nao migrante".
    *=====================================================================*

    gen byte tipo = 9

    * Mesmo municipio informado explicitamente.
    replace tipo = 0 if mun_o == mun_d & !missing(mun_o, mun_d)

    * Recuperar permanencia quando a origem municipal ficou em branco:
    * sempre morou ou reside ha pelo menos seis anos completos.
    * Nao aplicar quando ha evidencia de origem em outra UF ou no exterior.
    replace tipo = 0 if missing(mun_o) ///
        & (sempre_morou == 1 | inrange(anos_mor_mun, 6, 140)) ///
        & missing(pais_mor5anos) ///
        & (missing(UF_mor5anos) | UF_mor5anos == UF)

    * A classificacao territorial exige RGI identificada nos dois lados.
    replace tipo = 1 if mun_o != mun_d ///
        & rgi_o == rgi_d & !missing(rgi_o, rgi_d)

    replace tipo = 2 if rgi_o != rgi_d ///
        & uf_o == uf_d & !missing(rgi_o, rgi_d, uf_o, uf_d)

    replace tipo = 3 if uf_o != uf_d ///
        & macro_o == macro_d & !missing(uf_o, uf_d, macro_o, macro_d)

    replace tipo = 4 if macro_o != macro_d ///
        & !missing(macro_o, macro_d)

    * Pais/grupo estrangeiro identificado na codificacao do Data Zoom.
    replace tipo = 5 if inrange(pais_mor5anos, 30, 98) ///
        & missing(mun_o)

    label define tipo_lbl ///
        0 "Mesmo municipio" ///
        1 "Outro municipio da mesma RGI" ///
        2 "Outra RGI da mesma UF" ///
        3 "Outra UF da mesma macrorregiao" ///
        4 "Outra macrorregiao" ///
        5 "Exterior identificado" ///
        9 "Origem ou geografia indeterminada", replace

    label values tipo tipo_lbl

    * Os indicadores de entrada e saida abaixo tratam da migracao interna.
    gen byte migrante = inrange(tipo, 1, 4)


    *=====================================================================*
    * 5. PREPARAR AS VARIAVEIS DO PERFIL
    *
    * Renda individual: dez anos ou mais.
    * Trabalho e atividade economica: 14 anos ou mais.
    *
    * rend_total_def ja foi deflacionada pelo Data Zoom.
    * No esquema fornecido, esta expressa em reais de julho de 2022.
    *=====================================================================*

    gen double renda_ind = rend_total_def ///
        if idade >= 10 & idade < .

    * Reconstrucao da condicao de ocupacao.
    * Ausencia de informacao permanece missing.
    gen byte ocupado = .

    replace ocupado = 0 if idade >= 14 & idade < . ///
        & trab_rem_sem == 0 & afast_trab_sem == 0 & nao_remun == 0

    replace ocupado = 0 if idade >= 14 & idade < . ///
        & pos_ocup_sem == 9

    replace ocupado = 1 if idade >= 14 & idade < . ///
        & (trab_rem_sem == 1 | afast_trab_sem == 1 ///
        | nao_remun == 1 | inrange(pos_ocup_sem, 1, 8))

    * Os dois primeiros digitos de ativ2010 identificam a divisao CNAE.
    * Exemplo: 01101 -> divisao 01; 10010 -> divisao 10.
    gen byte divisao = floor(ativ2010 / 1000)

    * Setor primario inclui agropecuaria, florestas, pesca e extrativa mineral.
    * Industria inclui transformacao, utilidades e construcao.
    * Servicos inclui comercio.
    gen byte setor = .

    replace setor = 1 if ocupado == 1 & inrange(divisao, 1, 9)
    replace setor = 2 if ocupado == 1 & inrange(divisao, 10, 43)
    replace setor = 3 if ocupado == 1 & inrange(divisao, 45, 99)

    label define setor_lbl ///
        1 "Primario: agropecuaria e extrativa" ///
        2 "Industria, utilidades e construcao" ///
        3 "Comercio e servicos", replace

    label values setor setor_lbl

    * Renda do trabalho, entre os ocupados com informacao de renda.
    gen double renda_trabalho = rend_todos_trab_def if ocupado == 1

    * As variaveis abaixo valem 0 ou 100.
    * Sua media ponderada corresponde ao percentual do grupo.

    * Sexo no Data Zoom: 0 = feminino; 1 = masculino.
    gen double pct_mulheres = 100 * (sexo == 0) if inlist(sexo, 0, 1)

    * Cor/raca: usar raca, pois racaB agrega indigenas aos pardos.
    gen double pct_branca   = 100 * (raca == 1) if inrange(raca, 1, 5)
    gen double pct_preta    = 100 * (raca == 2) if inrange(raca, 1, 5)
    gen double pct_amarela  = 100 * (raca == 3) if inrange(raca, 1, 5)
    gen double pct_parda    = 100 * (raca == 4) if inrange(raca, 1, 5)
    gen double pct_indigena = 100 * (raca == 5) if inrange(raca, 1, 5)

    * Distribuicao etaria dos migrantes de cinco anos ou mais.
    gen double pct_5a14   = 100 * inrange(idade, 5, 14)
    gen double pct_15a24  = 100 * inrange(idade, 15, 24)
    gen double pct_25a39  = 100 * inrange(idade, 25, 39)
    gen double pct_40a59  = 100 * inrange(idade, 40, 59)
    gen double pct_60mais = 100 * (idade >= 60)

    * Ocupacao: percentual entre pessoas de 14+ com condicao conhecida.
    gen double pct_ocupados = 100 * ocupado

    * Setores: percentuais entre ocupados com atividade classificada.
    gen double pct_primario  = 100 * (setor == 1) if !missing(setor)
    gen double pct_industria = 100 * (setor == 2) if !missing(setor)
    gen double pct_servicos  = 100 * (setor == 3) if !missing(setor)


    * Reduzir o tamanho em memoria sem arredondar os valores.
    * Nomes territoriais serao recuperados na exportacao dos perfis.
    keep mun_d mun_o nome_o rgi_o nome_rgi_o uf_o macro_o macro_d ///
        tipo migrante `perfil'
    compress
    recast double peso_pess

    *---------------------------------------------------------------*
    * 2.1. Residentes e entradas: somas municipais desta UF.
    *---------------------------------------------------------------*
    preserve

        gen double w_imigrantes = peso_pess * (migrante == 1)
        gen double w_indeterminado = peso_pess * (tipo == 9)
        gen double w_exterior = peso_pess * (tipo == 5)

        collapse (sum) ///
            pop_5mais = peso_pess ///
            imigrantes = w_imigrantes ///
            origem_indeterminada = w_indeterminado ///
            exterior_identificado = w_exterior, by(mun_d)

        rename mun_d mun
        save "`intermediarios'/municipios_`uf'.dta", replace

    restore

    *---------------------------------------------------------------*
    * 2.2. Fluxos por origem, tipo e macro de destino: parcela desta UF.
    * As parcelas serao somadas antes de calcular participacoes.
    *---------------------------------------------------------------*
    preserve

        keep if migrante == 1
        gen double pessoa_amostra = 1

        collapse (sum) ///
            fluxo = peso_pess ///
            n_amostra = pessoa_amostra, ///
            by(mun_o nome_o rgi_o nome_rgi_o uf_o macro_o tipo macro_d)

        save "`intermediarios'/fluxos_`uf'.dta", replace

    restore

    * Somente os migrantes precisam ser guardados para os perfis.
    keep if migrante == 1
    keep mun_d mun_o uf_o macro_o macro_d tipo `perfil'
    compress
    recast double peso_pess

    *---------------------------------------------------------------*
    * 2.3. Imigrantes: todos os registros de cada municipio de destino
    * ja estao contidos no arquivo estadual que acabou de ser aberto.
    *---------------------------------------------------------------*
    preserve

        gen str10 papel = "Imigrante"
        gen long mun = mun_d
        gen byte macro_contraparte = macro_o
        label values macro_contraparte macro_lbl

        keep mun papel tipo macro_contraparte `perfil'
        save "`intermediarios'/micro_Imigrante_`codigo'.dta", replace

    restore

    *---------------------------------------------------------------*
    * 2.4. Emigrantes: separar a parcela observada nesta UF por UF de
    * origem. Assim, quem saiu de MG para SP sera agregado com quem
    * saiu de MG para qualquer outro estado na etapa seguinte.
    * Cada fragmento contem apenas as colunas necessarias aos perfis.
    *---------------------------------------------------------------*
    gen str10 papel = "Emigrante"
    gen long mun = mun_o
    gen byte macro_contraparte = macro_d
    label values macro_contraparte macro_lbl

    keep uf_o mun papel tipo macro_contraparte `perfil'

    foreach origem of local codigos {
        preserve
            keep if uf_o == `origem'
            drop uf_o
            * Gravar inclusive fragmentos vazios evita reutilizar
            * registros remanescentes de uma execucao anterior.
            save "`intermediarios'/emig_`uf'_`origem'.dta", replace
        restore
    }
}

*=====================================================================*
* 3. CALCULAR PERFIS COMPLETOS, UMA UF DE REFERENCIA POR VEZ
*
* Imigrantes: UF do municipio onde residem em 2010.
* Emigrantes: UF do municipio onde residiam em 2005.
*
* Cada grupo mun/papel/tipo/macro_contraparte e calculado uma unica vez,
* com TODOS os seus registros. Nao se faz media de medias ou medianas.
*=====================================================================*

foreach papel in Imigrante Emigrante {
    foreach codigo of local codigos {

        display as result "Perfil de `papel': UF de referencia `codigo'..."

        if "`papel'" == "Imigrante" {
            use "`intermediarios'/micro_Imigrante_`codigo'.dta", clear
        }
        else {
            use "`intermediarios'/emig_RO_`codigo'.dta", clear
            foreach uf of local outras {
                append using "`intermediarios'/emig_`uf'_`codigo'.dta"
            }
        }

        * Restaurar o armazenamento double das variaveis de perfil
        * apos a compactacao dos fragmentos em disco.
        recast double renda_ind renda_trabalho pct_*

        * Mesmos comandos de contagem, media e mediana do original.
        * Quantidades amostrais e expandidas de cada perfil.
        gen byte pessoa_amostra = 1

        gen double w_renda = peso_pess if !missing(renda_ind)
        gen double w_setor = peso_pess if !missing(setor)

        preserve

            collapse (sum) ///
                migrantes = peso_pess ///
                n_amostra = pessoa_amostra ///
                pessoas_com_renda = w_renda ///
                ocupados_com_setor = w_setor, ///
                by(mun papel tipo macro_contraparte)

            save `contagens', replace

        restore

        * Medias e percentuais ponderados pelo peso da pessoa.
        * Cada variavel utiliza os casos com informacao disponivel.
        collapse ///
            (mean) ///
                idade_media = idade ///
                renda_media = renda_ind ///
                renda_trabalho_media = renda_trabalho ///
                pct_mulheres ///
                pct_branca pct_preta pct_amarela pct_parda pct_indigena ///
                pct_5a14 pct_15a24 pct_25a39 pct_40a59 pct_60mais ///
                pct_ocupados pct_primario pct_industria pct_servicos ///
            (p50) renda_mediana = renda_ind ///
            [pw = peso_pess], ///
            by(mun papel tipo macro_contraparte)

        gen double pct_homens = 100 - pct_mulheres

        merge 1:1 mun papel tipo macro_contraparte ///
            using `contagens', nogen

        merge m:1 mun using `geografia', keep(master match) nogen

        decode tipo, gen(tipo_migracao)
        decode macro_contraparte, gen(regiao_contraparte)

        order mun nome_mun rgi nome_rgi ///
            papel tipo tipo_migracao regiao_contraparte ///
            migrantes n_amostra ///
            renda_media renda_mediana renda_trabalho_media ///
            idade_media pct_mulheres pct_homens


        save "`intermediarios'/perfil_`papel'_`codigo'.dta", replace
    }
}

*=====================================================================*
* 4. UNIFICAR SOMENTE OS FLUXOS JA AGREGADOS
*=====================================================================*

use "`intermediarios'/fluxos_RO.dta", clear
foreach uf of local outras {
    append using "`intermediarios'/fluxos_`uf'.dta"
}

* O mesmo municipio de origem pode aparecer em varios arquivos estaduais.
collapse (sum) fluxo n_amostra, ///
    by(mun_o nome_o rgi_o nome_rgi_o uf_o macro_o tipo macro_d)

* Saidas totais de cada municipio, considerando todos os destinos.
preserve
    collapse (sum) emigrantes = fluxo, by(mun_o)
    rename mun_o mun
    save `saidas'
restore

save "`intermediarios'/fluxos_unificados.dta", replace

*=====================================================================*
* 5. UNIFICAR INDICADORES MUNICIPAIS E EXPORTAR A PRIMEIRA ABA
*=====================================================================*

use "`intermediarios'/municipios_RO.dta", clear
foreach uf of local outras {
    append using "`intermediarios'/municipios_`uf'.dta"
}

* Residentes e entradas ja estao completos por municipio de destino.
* Incorporar agora as saidas observadas nas 27 UFs.
merge 1:1 mun using `saidas', nogen

replace imigrantes = 0 if missing(imigrantes)
replace emigrantes = 0 if missing(emigrantes)

* Saldo positivo: mais entradas que saidas.
gen double saldo = imigrantes - emigrantes

* Volume de trocas migratorias do municipio.
gen double volume = imigrantes + emigrantes

* Indicadores por mil residentes de cinco anos ou mais.
* Referem-se ao quinquenio; nao sao taxas anuais.
gen double tx_imigracao = 1000 * imigrantes / pop_5mais
gen double tx_emigracao = 1000 * emigrantes / pop_5mais
gen double tx_saldo     = 1000 * saldo / pop_5mais
gen double tx_volume    = 1000 * volume / pop_5mais

* Eficacia varia entre -1 e 1 quando ha trocas migratorias.
gen double eficacia = saldo / volume

gen double pct_indeterminado = ///
    100 * origem_indeterminada / pop_5mais

merge m:1 mun using `geografia', keep(master match) nogen

order mun nome_mun rgi nome_rgi uf macro ///
    pop_5mais imigrantes emigrantes saldo volume

* A primeira exportacao cria/substitui o arquivo Excel.
export excel using "`excel'", ///
    sheet("Indicadores_municipais") firstrow(variables) replace


*=====================================================================*
* 6. EXPORTAR OS DESTINOS DOS EMIGRANTES APOS A SOMA NACIONAL
*=====================================================================*

use "`intermediarios'/fluxos_unificados.dta", clear

bysort mun_o: egen double total_saidas = total(fluxo)

gen double participacao_saidas = 100 * fluxo / total_saidas

decode tipo, gen(tipo_migracao)
decode macro_o, gen(regiao_origem)
decode macro_d, gen(regiao_destino)

order mun_o nome_o rgi_o nome_rgi_o ///
    tipo tipo_migracao regiao_origem regiao_destino ///
    fluxo participacao_saidas n_amostra

export excel using "`excel'", ///
    sheet("Destino_dos_emigrantes", replace) firstrow(variables)



*=====================================================================*
* 7. REUNIR SOMENTE OS PERFIS JA AGREGADOS E EXPORTAR A TERCEIRA ABA
*=====================================================================*

use "`intermediarios'/perfil_Imigrante_11.dta", clear
foreach papel in Imigrante Emigrante {
    foreach codigo of local codigos {
        if !("`papel'" == "Imigrante" & `codigo' == 11) {
            append using "`intermediarios'/perfil_`papel'_`codigo'.dta"
        }
    }
}

sort mun papel tipo macro_contraparte

export excel using "`excel'", ///
    sheet("Perfil_dos_migrantes", replace) firstrow(variables)

display as result "Excel criado em: `excel'"
display as text "Intermediarios gravados em: `intermediarios'"
