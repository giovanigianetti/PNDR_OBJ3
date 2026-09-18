********************************************************************************
* Projeto: Censos Demograficos 2000, 2010 e 2022
* Versao corrigida: 18/09/2026 - localizador com argumentos posicionais
* Objetivo: reproduzir, para 2000 e 2010, a estrutura do arquivo de demografia
*           do Censo 2022, considerando somente o total da populacao.
*
* Saidas: dois arquivos DTA, um para cada ano, identificados por setor:
*         ano cd_setor cd_uf v01006 v01031-v01041
*         A base de 2010 inclui ainda totais independentes obtidos pela soma
*         das cinco categorias de cor ou raca de Pessoa03 e as diferencas em
*         relacao aos resultados construidos a partir das idades simples de
*         Pessoa13.
*
* Observacoes importantes:
* 1. Os valores omitidos pelo IBGE (celulas vazias em 2000; "x" em 2010)
*    permanecem missing. Eles nunca sao convertidos em zero.
* 2. O programa procura os arquivos dentro das subpastas das duas pastas-raiz.
*    Assim, Sao Paulo1/Sao Paulo2 e SP_Capital/SP_Exceto_Capital sao tratados
*    automaticamente como blocos distintos e depois empilhados.
* 3. Em 2010, V023-V034 sao o detalhamento em meses de V022 (menos de 1 ano).
*    Essas variaveis NAO entram na soma, evitando dupla contagem.
* 4. Em Pessoa03 de 2010, V027-V036 detalham a faixa de 15 a 19 anos em
*    15-17 e 18-19. Como V022-V026 ja fornecem 15-19, V027-V036 nao entram
*    novamente nas somas de conferencia.
********************************************************************************

version 16.0
clear all
set more off
set varabbrev off

********************************************************************************
* 1. CAMINHOS - alterar somente se a organizacao das pastas mudar
********************************************************************************

global ROOT2000 ///
    "H:\Meu Drive\IICA 2\MIDR 2026-2027\P3 - OBJ 2 e 3\Censo Demográfico 2000\Agregados por setores"

global ROOT2010 ///
    "H:\Meu Drive\IICA 2\MIDR 2026-2027\P3 - OBJ 2 e 3\Censo Demográfico 2010\Agregados pro setores"

global SAIDA2000 ///
    "H:\Meu Drive\IICA 2\MIDR 2026-2027\P3 - OBJ 2 e 3\Censo_Demografia_Setores_2000.dta"

global SAIDA2010 ///
    "H:\Meu Drive\IICA 2\MIDR 2026-2027\P3 - OBJ 2 e 3\Censo_Demografia_Setores_2010.dta"

* Ha 27 UFs, mas Sao Paulo esta dividido em dois blocos em cada censo.
local blocos_esperados_2000 = 28
local blocos_esperados_2010 = 28

********************************************************************************
* 2. PROGRAMAS AUXILIARES
********************************************************************************

* Localiza exatamente um arquivo com o radical solicitado.
* Argumentos posicionais: pasta, radical e prioridade (excel ou csv).
* O caminho nao e tratado como opcao do comando, evitando diretorio() vazio.
capture program drop __localiza_arquivo
program define __localiza_arquivo, rclass
    version 16.0
    args diretorio radical prioridade

    if `"`diretorio'"' == "" {
        display as error "A pasta de busca nao foi informada."
        exit 198
    }
    if `"`radical'"' == "" {
        display as error "O radical do arquivo nao foi informado."
        exit 198
    }

    if lower(`"`prioridade'"') == "csv" {
        local extensoes "csv xls xlsx XLS"
    }
    else if lower(`"`prioridade'"') == "excel" {
        local extensoes "xls xlsx csv XLS"
    }
    else {
        display as error "Prioridade invalida: use excel ou csv."
        exit 198
    }

    foreach extensao of local extensoes {
        local encontrados : dir `"`diretorio'"' files `"`radical'*.`extensao'"'
        local n : word count `encontrados'

        if `n' > 1 {
            display as error "Mais de um arquivo `radical' foi encontrado em:"
            display as error `"`diretorio'"'
            display as error `"`encontrados'"'
            exit 459
        }

        if `n' == 1 {
            local arquivo : word 1 of `encontrados'
            return scalar encontrado = 1
            return local arquivo `"`arquivo'"'
            return local extensao "`extensao'"
            exit
        }
    }

    return scalar encontrado = 0
    return local arquivo ""
    return local extensao ""
end


* Importa CSV, XLS ou XLSX mantendo todas as colunas originalmente como string.
* Essa opcao preserva o codigo de setor com seus 15 digitos e permite tratar "x".
capture program drop __importa_arquivo
program define __importa_arquivo
    version 16.0
    syntax using/, EXTensao(string)

    if lower(`"`extensao'"') == "csv" {
        import delimited using `"`using'"', clear varnames(1) stringcols(_all)
        rename *, lower
    }
    else {
        import excel using `"`using'"', clear firstrow allstring case(lower)
    }
end


* Padroniza e valida o identificador do setor censitario.
capture program drop __prepara_codigo_setor
program define __prepara_codigo_setor
    version 16.0

    capture confirm variable cod_setor
    if _rc {
        display as error "A variavel Cod_setor nao foi encontrada no arquivo."
        describe
        exit 111
    }

    rename cod_setor cd_setor
    replace cd_setor = strtrim(cd_setor)

    * Protecao para eventual leitura de identificador textual terminado em .0.
    replace cd_setor = substr(cd_setor, 1, strlen(cd_setor) - 2) ///
        if regexm(cd_setor, "^[0-9]+[.]0$")

    assert strlen(cd_setor) == 15
    assert real(cd_setor) < .
    isid cd_setor
end


* Converte variaveis para numerico, preservando "x" ou "X" como missing.
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


* Soma estrita: se qualquer componente estiver missing, o resultado fica missing.
* Evita que egen rowtotal interprete informacao suprimida como zero.
capture program drop __soma_estrita
program define __soma_estrita
    version 16.0
    syntax varlist(numeric min=1), GENerate(name)

    confirm new variable `generate'
    tempvar numero_missing

    egen double `generate' = rowtotal(`varlist')
    egen int `numero_missing' = rowmiss(`varlist')
    replace `generate' = . if `numero_missing' > 0
end


* Cria indicadores de sigilo e consistencia para a estrutura harmonizada.
capture program drop __controles_finais
program define __controles_finais
    version 16.0

    tempvar numero_missing soma_faixas

    egen int `numero_missing' = rowmiss(v01006 v01031-v01041)
    generate byte flag_supressao = (`numero_missing' > 0)

    egen double `soma_faixas' = rowtotal(v01031-v01041)
    generate byte flag_inconsistencia = (`soma_faixas' != v01006) ///
        if flag_supressao == 0

    label variable flag_supressao ///
        "1 = ao menos uma variavel demografica foi omitida pelo IBGE"
    label variable flag_inconsistencia ///
        "1 = soma das faixas etarias difere da populacao total"
end


* Rotulos equivalentes ao arquivo de demografia do Censo 2022.
capture program drop __rotulos_2022
program define __rotulos_2022
    version 16.0

    label variable ano       "Ano do Censo Demografico"
    label variable cd_setor  "Codigo do setor censitario na malha original do censo"
    label variable cd_uf     "Codigo da Unidade da Federacao"
    label variable v01006    "Quantidade de moradores"
    label variable v01031    "0 a 4 anos"
    label variable v01032    "5 a 9 anos"
    label variable v01033    "10 a 14 anos"
    label variable v01034    "15 a 19 anos"
    label variable v01035    "20 a 24 anos"
    label variable v01036    "25 a 29 anos"
    label variable v01037    "30 a 39 anos"
    label variable v01038    "40 a 49 anos"
    label variable v01039    "50 a 59 anos"
    label variable v01040    "60 a 69 anos"
    label variable v01041    "70 anos ou mais"

    format cd_setor %15s
end


* Compara os totais construidos a partir de Pessoa13 com os totais obtidos
* pela soma das cinco categorias de cor ou raca de Pessoa03.
capture program drop __controles_raca
program define __controles_raca
    version 16.0

    local codigos "v01006 v01031 v01032 v01033 v01034 v01035 v01036 v01037 v01038 v01039 v01040 v01041"
    local diferencas

    foreach codigo of local codigos {
        generate double dif_raca_`codigo' = check_raca_`codigo' - `codigo'
        local diferencas `diferencas' dif_raca_`codigo'
    }

    egen byte n_checks_raca = rownonmiss(`diferencas')
    generate byte n_diferencas_raca = .
    replace n_diferencas_raca = 0 if n_checks_raca > 0

    foreach diferenca of local diferencas {
        replace n_diferencas_raca = n_diferencas_raca + 1 ///
            if !missing(`diferenca') & `diferenca' != 0
    }

    generate byte flag_inconsistencia_raca = (n_diferencas_raca > 0) ///
        if n_checks_raca > 0

    label variable n_checks_raca ///
        "Numero de totais comparaveis entre Pessoa13 e Pessoa03"
    label variable n_diferencas_raca ///
        "Numero de totais divergentes entre Pessoa13 e Pessoa03"
    label variable flag_inconsistencia_raca ///
        "1 = ao menos um total por idade difere da soma das racas"
end


* Rotulos das variaveis de auditoria por cor ou raca.
capture program drop __rotulos_raca
program define __rotulos_raca
    version 16.0

    label variable check_raca_v01006 "Soma das 5 racas: quantidade de moradores"
    label variable check_raca_v01031 "Soma das 5 racas: 0 a 4 anos"
    label variable check_raca_v01032 "Soma das 5 racas: 5 a 9 anos"
    label variable check_raca_v01033 "Soma das 5 racas: 10 a 14 anos"
    label variable check_raca_v01034 "Soma das 5 racas: 15 a 19 anos"
    label variable check_raca_v01035 "Soma das 5 racas: 20 a 24 anos"
    label variable check_raca_v01036 "Soma das 5 racas: 25 a 29 anos"
    label variable check_raca_v01037 "Soma das 5 racas: 30 a 39 anos"
    label variable check_raca_v01038 "Soma das 5 racas: 40 a 49 anos"
    label variable check_raca_v01039 "Soma das 5 racas: 50 a 59 anos"
    label variable check_raca_v01040 "Soma das 5 racas: 60 a 69 anos"
    label variable check_raca_v01041 "Soma das 5 racas: 70 anos ou mais"

    label variable dif_raca_v01006 "Soma das racas menos total de Pessoa13"
    label variable dif_raca_v01031 "Soma das racas menos Pessoa13: 0 a 4 anos"
    label variable dif_raca_v01032 "Soma das racas menos Pessoa13: 5 a 9 anos"
    label variable dif_raca_v01033 "Soma das racas menos Pessoa13: 10 a 14 anos"
    label variable dif_raca_v01034 "Soma das racas menos Pessoa13: 15 a 19 anos"
    label variable dif_raca_v01035 "Soma das racas menos Pessoa13: 20 a 24 anos"
    label variable dif_raca_v01036 "Soma das racas menos Pessoa13: 25 a 29 anos"
    label variable dif_raca_v01037 "Soma das racas menos Pessoa13: 30 a 39 anos"
    label variable dif_raca_v01038 "Soma das racas menos Pessoa13: 40 a 49 anos"
    label variable dif_raca_v01039 "Soma das racas menos Pessoa13: 50 a 59 anos"
    label variable dif_raca_v01040 "Soma das racas menos Pessoa13: 60 a 69 anos"
    label variable dif_raca_v01041 "Soma das racas menos Pessoa13: 70 anos ou mais"
end

********************************************************************************
* 3. CENSO DEMOGRAFICO 2000
*    Fonte: Pessoa1_UF.xls
********************************************************************************

tempfile base2000 base2010 idade2010 raca2010
local primeiro_2000 = 1
local n_blocos_2000 = 0

local pastas2000 : dir "${ROOT2000}" dirs "*"

foreach pasta of local pastas2000 {
    * Use / ao concatenar o caminho. No Stata, a barra invertida antes do
    * delimitador de macro pode impedir sua expansao e gerar diretorio() vazio.
    local diretorio `"${ROOT2000}/`pasta'"'

    __localiza_arquivo `"`diretorio'"' "Pessoa1_" "excel"

    * Ignora subpastas que nao contenham o arquivo demografico necessario.
    if r(encontrado) == 0 continue

    local arquivo  `"`r(arquivo)'"'
    local extensao `"`r(extensao)'"'
    local caminho  `"`diretorio'/`arquivo'"'

    display as text "2000: processando `caminho'"

    quietly __importa_arquivo using `"`caminho'"', extensao("`extensao'")
    quietly __prepara_codigo_setor

    keep cd_setor v1330 v1448-v1464
    __converte_numericas v1330 v1448-v1464

    * Total da populacao.
    generate double v01006 = v1330

    * Faixas que ja existem diretamente no produto de 2000.
    generate double v01031 = v1448
    generate double v01032 = v1449
    generate double v01033 = v1450
    generate double v01034 = v1451
    generate double v01035 = v1452
    generate double v01036 = v1453

    * Compatibilizacao com as faixas mais amplas adotadas em 2022.
    __soma_estrita v1454 v1455, generate(v01037)
    __soma_estrita v1456 v1457, generate(v01038)
    __soma_estrita v1458 v1459, generate(v01039)
    __soma_estrita v1460 v1461, generate(v01040)
    __soma_estrita v1462 v1463 v1464, generate(v01041)

    keep cd_setor v01006 v01031-v01041
    generate int ano = 2000
    generate str2 cd_uf = substr(cd_setor, 1, 2)

    __controles_finais
    __rotulos_2022

    order ano cd_setor cd_uf v01006 v01031-v01041 ///
        flag_supressao flag_inconsistencia
    sort cd_setor
    isid cd_setor
    compress

    if `primeiro_2000' {
        save `base2000', replace
        local primeiro_2000 = 0
    }
    else {
        append using `base2000'
        sort cd_setor
        isid cd_setor
        save `base2000', replace
    }

    local ++n_blocos_2000
}

if `n_blocos_2000' != `blocos_esperados_2000' {
    display as error "Foram processados `n_blocos_2000' blocos de 2000; eram esperados `blocos_esperados_2000'."
    display as error "Confira os nomes das subpastas e a existencia dos arquivos Pessoa1_UF."
    exit 459
}

use `base2000', clear
sort cd_setor
isid cd_setor

label data "Demografia por setor - Censo 2000 harmonizado ao Censo 2022"
notes: Valores na malha setorial original de 2000; ainda nao compatibilizados espacialmente com a malha de 2022.
notes: Celulas omitidas pelo IBGE permanecem missing e sao identificadas por flag_supressao.
notes: Fonte: Pessoa1_UF.

compress
save "${SAIDA2000}", replace

display as result "Censo 2000 concluido: " _N " setores em " `n_blocos_2000' " blocos."
display as result "Base de 2000 salva em:"
display as result "${SAIDA2000}"
tabulate flag_supressao, missing
tabulate flag_inconsistencia, missing

********************************************************************************
* 4. CENSO DEMOGRAFICO 2010
*    Fontes:
*    - Pessoa13_UF: total por idade simples
*    - Pessoa03_UF: classes de idade por cor ou raca, usadas para conferencia
********************************************************************************

local primeiro_2010 = 1
local n_blocos_2010 = 0

local pastas2010 : dir "${ROOT2010}" dirs "*"

foreach pasta of local pastas2010 {
    * A barra normal evita que a barra invertida escape o macro da subpasta.
    local diretorio `"${ROOT2010}/`pasta'"'

    * Quando existirem CSV e XLS, usa-se o CSV corrigido mais recente.
    __localiza_arquivo `"`diretorio'"' "Pessoa13_" "csv"

    * Ignora subpastas que nao contenham o arquivo demografico necessario.
    if r(encontrado) == 0 continue

    local arquivo  `"`r(arquivo)'"'
    local extensao `"`r(extensao)'"'
    local caminho  `"`diretorio'/`arquivo'"'

    display as text "2010: processando `caminho'"

    quietly __importa_arquivo using `"`caminho'"', extensao("`extensao'")
    quietly __prepara_codigo_setor

    * V022 = menos de 1 ano. V023-V034 sao meses e nao devem ser somadas.
    keep cd_setor v001 v022 v035-v134
    __converte_numericas v001 v022 v035-v134

    generate double v01006 = v001

    __soma_estrita v022 v035-v038, generate(v01031)
    __soma_estrita v039-v043,      generate(v01032)
    __soma_estrita v044-v048,      generate(v01033)
    __soma_estrita v049-v053,      generate(v01034)
    __soma_estrita v054-v058,      generate(v01035)
    __soma_estrita v059-v063,      generate(v01036)
    __soma_estrita v064-v073,      generate(v01037)
    __soma_estrita v074-v083,      generate(v01038)
    __soma_estrita v084-v093,      generate(v01039)
    __soma_estrita v094-v103,      generate(v01040)
    __soma_estrita v104-v134,      generate(v01041)

    keep cd_setor v01006 v01031-v01041
    generate int ano = 2010
    generate str2 cd_uf = substr(cd_setor, 1, 2)

    save `idade2010', replace

    ***************************************************************************
    * Conferencia independente: soma das cinco categorias de cor ou raca
    * em Pessoa03 (branca, preta, amarela, parda e indigena).
    ***************************************************************************

    __localiza_arquivo `"`diretorio'"' "Pessoa03_" "csv"

    if r(encontrado) == 0 {
        display as error "Pessoa03 nao foi encontrado na pasta:"
        display as error `"`diretorio'"'
        exit 601
    }

    local arquivo_raca  `"`r(arquivo)'"'
    local extensao_raca `"`r(extensao)'"'
    local caminho_raca  `"`diretorio'/`arquivo_raca'"'

    quietly __importa_arquivo using `"`caminho_raca'"', ///
        extensao("`extensao_raca'")
    quietly __prepara_codigo_setor

    * A documentacao imprime V02 para a segunda variavel, mas os arquivos
    * normalmente utilizam V002. O trecho abaixo aceita as duas grafias.
    capture confirm variable v002
    if _rc {
        capture confirm variable v02
        if !_rc rename v02 v002
    }

    keep cd_setor v001-v086
    __converte_numericas v001-v086

    * Total: soma das cinco categorias de cor ou raca.
    __soma_estrita v002-v006, generate(check_raca_v01006)

    * Faixas ja coincidentes com a estrutura de 2022.
    __soma_estrita v007-v011, generate(check_raca_v01031)
    __soma_estrita v012-v016, generate(check_raca_v01032)
    __soma_estrita v017-v021, generate(check_raca_v01033)
    __soma_estrita v022-v026, generate(check_raca_v01034)

    * V027-V031 (15-17) e V032-V036 (18-19) sao componentes de V022-V026;
    * por isso, nao sao novamente somadas.
    __soma_estrita v037-v041, generate(check_raca_v01035)
    __soma_estrita v042-v046, generate(check_raca_v01036)

    * Duas classes quinquenais sao agregadas para cada faixa decenal de 2022.
    __soma_estrita v047-v056, generate(check_raca_v01037)
    __soma_estrita v057-v066, generate(check_raca_v01038)
    __soma_estrita v067-v076, generate(check_raca_v01039)

    * Estas classes ja sao decenal e aberta, respectivamente.
    __soma_estrita v077-v081, generate(check_raca_v01040)
    __soma_estrita v082-v086, generate(check_raca_v01041)

    keep cd_setor check_raca_v01006 check_raca_v01031-check_raca_v01041
    sort cd_setor
    isid cd_setor
    save `raca2010', replace

    use `idade2010', clear
    merge 1:1 cd_setor using `raca2010', assert(3) nogen

    __controles_finais
    __controles_raca
    __rotulos_2022
    __rotulos_raca

    order ano cd_setor cd_uf v01006 v01031-v01041 ///
        flag_supressao flag_inconsistencia ///
        check_raca_v01006 check_raca_v01031-check_raca_v01041 ///
        dif_raca_v01006 dif_raca_v01031-dif_raca_v01041 ///
        n_checks_raca n_diferencas_raca flag_inconsistencia_raca
    sort cd_setor
    isid cd_setor
    compress

    if `primeiro_2010' {
        save `base2010', replace
        local primeiro_2010 = 0
    }
    else {
        append using `base2010'
        sort cd_setor
        isid cd_setor
        save `base2010', replace
    }

    local ++n_blocos_2010
}

if `n_blocos_2010' != `blocos_esperados_2010' {
    display as error "Foram processados `n_blocos_2010' blocos de 2010; eram esperados `blocos_esperados_2010'."
    display as error "Confira as subpastas e a existencia dos arquivos Pessoa13_UF e Pessoa03_UF."
    exit 459
}

use `base2010', clear
sort cd_setor
isid cd_setor

label data "Demografia por setor - Censo 2010 harmonizado ao Censo 2022"
notes: Valores na malha setorial original de 2010; ainda nao compatibilizados espacialmente com a malha de 2022.
notes: Celulas omitidas pelo IBGE permanecem missing e sao identificadas por flag_supressao.
notes: Fontes: Pessoa13_UF e Pessoa03_UF.
notes: Variaveis check_raca_* somam branca, preta, amarela, parda e indigena em Pessoa03.
notes: Variaveis dif_raca_* correspondem a check_raca_* menos o total construido com Pessoa13.

compress
save "${SAIDA2010}", replace

display as result "Censo 2010 concluido: " _N " setores em " `n_blocos_2010' " blocos."
display as result "Base de 2010 salva em:"
display as result "${SAIDA2010}"
tabulate flag_supressao, missing
tabulate flag_inconsistencia, missing
tabulate flag_inconsistencia_raca, missing
summarize n_checks_raca n_diferencas_raca

********************************************************************************
* FIM
********************************************************************************
