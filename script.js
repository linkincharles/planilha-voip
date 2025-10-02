listaNumeros = [];
listaLinks = [];

$(document).ready(function () {
    $('#validationDefault04').on('input', function () {
        var valor = $(this).val();

        // Remover caracteres não numéricos
        valor = valor.replace(/\D/g, '');

        // Adicionar separadores de data
        if (valor.length > 2 && valor.length <= 4) {
            valor = valor.substring(0, 2) + '-' + valor.substring(2);
        } else if (valor.length > 4) {
            valor = valor.substring(0, 2) + '-' + valor.substring(2, 4) + '-' + valor.substring(4, 8);
        }

        // Atualizar o valor no campo de entrada
        $(this).val(valor);
    });
});

function updateListClient(filtrar = false) {
    listaNumeros = [];
    listaLinks = [];
    $.ajax({
        url: "requests.php",
        type: "GET",
        dataType: "JSON",
        data: "a=a" + (filtrar ? "&filtro=" + filtrar : ""),
        async: false,
    }).done(function (resposta) {
        listaNumeros = resposta["numeros"];
        listaLinks = resposta["links"];
        paginacao = 1
        $("#qtdResult").html(listaNumeros.length + " resultados")
        getPaginationAndData()
        $(":checkbox").change(function () {
            if ($(this).attr("name")) {
                $(":checkbox").prop('checked', this.checked)
            }
        })
    }).fail(function (jqXHR, textStatus) {
        console.log("Request failed: " + textStatus);

    }).always(function () {
    });
}

$("#filtrar").on("click", function () {
    value = $("#filterInput").val()
    updateListClient(value)
})


$("#filterInput").on("keypress", function (e) {
    if (e.which == 13) {
        document.getElementById("filtrar").click();
    }
});

function adicionarLinha(data) {
    const checkBox = document.createElement("td");
    checkBox.innerHTML = '<div class="form-check"><input class="checkbox form-check-input" type="checkbox"></div>';
    const row = document.createElement("tr");
    row.setAttribute('id', data.ID)
    $(row).append(checkBox);
    options = ["ID", "name", "number", "operator", "server", "stats", "date"];
    for (let i = 0; i < 6; i++) {
        classe = ""
        const cell = document.createElement("td");
        text = data[options[i]]
        if (options[i] == "stats") {
            if (text == 1) {
                text = "Ativo (" + (data["date"] ?? "N/A") + ")"
                $(cell).css("background-color", " rgba(11, 213, 55, 0.63)")
            } else if (text == 2) {
                text = "Suspenso (" + (data["date"] ?? "N/A") + ")"
                $(cell).css("background-color", " rgba(213, 119, 11, 0.63)")
            } else if (text == 3) {
                text = "Cancelado (" + (data["date"] ?? "N/A") + ")"
                $(cell).css("background-color", "rgba(213, 11, 11, 0.63)")
            }
        }
        $(cell).attr("data-tipo", options[i])
        if (options[i] == "server") {
            textvisu = text.replace("https://", "").replace("http://", "")
            textURL = (text.search("http://") <= -1 && text.search("https://") <= -1) ? "http://" + text : text
            cell.innerHTML = '<a  target=_blank href="' + textURL + '"><th>' + textvisu + '</th></a>';
        } else if (listaLinks[text]) {
            // verificar essa linha e acrescentar o http:// em todos os links. Esperar retorno do Charles sobre a VPN
            textURL = (listaLinks[text].search("http://") <= -1 && listaLinks[text].search("https://") <= -1) ? "http://" + listaLinks[text] : listaLinks[text]
            cell.innerHTML = '<a target=_blank href="' + textURL + '"><th>' + text + '</th></a>';
        } else {
            const cellText = document.createTextNode(text);
            $(cell).append(cellText);
        }
        $(row).append(cell);

    }
    $("tbody").append(row);
    $("#table").append($("tbody"));
    //$(document.body).append($("table"));
}

function adicionar() {
    $('#exampleModal').modal('show')
    $('#validationDefault00').prop("value", "")
    $('#validationDefault01').prop("value", "")
    $('#validationDefault06').prop("value", "")
    $('#validationDefault02').prop("value", "")
    $('#validationDefault02').prop('disabled', false);
    $('#inputState').prop("value", "AMERICANET")
    $('#validationDefault03').prop("value", "")
    $('#inputState2').prop("value", "Ativo")
    $('#validationDefault04').prop("value", "")
    $('#exampleModal').modal('show')
}

$("#salvar").on("click", function () {
    id = $("input[name='numeroID']").val()
    listaToServer = {
        "nome": $("input[name='empresaNome']").val(),
        "contrato": encodeURIComponent($("input[name='contratoURL']").val() ?? ""),
        "numeros": $("input[name='numeros']").val(),
        "operator": $("select[name='operadora']").val(),
        "server": $("input[name='servidor']").val(),
        "status": $("select[name='status']").val(),
        "data": $("input[name='data']").val(),
        "editing": $("input[name='data']").val(),
    };
    if (getValidadores(listaToServer)) {
        return;
    }
    if (id.length > 0 && id != "") {
        listaToServer["id"] = id
    }
    // console.log(listaToServer)
    $.ajax({
        url: "requests.php",
        type: "POST",
        data: 'data=' + JSON.stringify(listaToServer),
        //data: "data=" + JSON.parse(listaToServer),
        dataType: "JSON",
        async: true,

    }).done(function (resposta) {
        if (resposta["code"] == 2002) {
            exito = resposta.data.numerosExito
            falha = resposta.data.numerosFalha
            if (exito.length > 0) {
                myAlertTop(exito.length + " números foram adicionados. " + exito.join(", "), 15)
            }
            if (falha.length > 0) {
                myAlertBottom(exito.length + " números falharam. " + falha.join(", "), 15)
            }
            setTimeout(function () {
                updateListClient()
            }, 500)
        } else if (resposta["code"] == 2002.2) {
            myAlertTop("Número atualizado com sucesso.")
            setTimeout(function () {
                updateListClient()
            }, 500)
        } else if (getValidadores(listaToServer, resposta["code"])) {
            return
        }
    }).fail(function (jqXHR, textStatus) {
        console.log("Request failed: " + textStatus);

    }).always(function () {
        console.log("completou add");
    });
})

function getValidadores(data = [], code = 0) {
    if ((data && data['nome'].length < 4) || code == 2009) {
        myAlertBottom("Informe um nome com no mínimo 4 caracteres.")
        return true;
    } else if ((data && data['nome'].length > 500) || code == 2011) {
        myAlertBottom("O nome pode ter no máximo 500 caracteres.")
        return true;
    } else if ((data && data['contrato'].length > 500) || code == 2021) {
        myAlertBottom("O contrato deve possuir, no máximo, 500 caracteres.")
        return true;
    } else if ((data && data['numeros'].length < 3) || code == 2021) {
        myAlertBottom("Informe ao menos um número válido, com no mínimo 3 digitos.")
        return true;
    } else if (code == 2003) {
        myAlertBottom("A data deve seguir o formato (dd-mm-aaaa). Exemplo: 22-05-2025")
        return true;
    } else if (code == 2005) {
        myAlertBottom("Informe ao menos um número válido, com no mínimo 3 digitos.")
        return true;
    } else if (code == 2006) {
        myAlertBottom("Selecione uma das operadores válidas.")
        return true;
    } else if (code == 2007) {
        myAlertBottom("Informe o IP do servidor.")
        return true;
    } else if (code == 2008) {
        myAlertBottom("Status inválido. Informe corretamente.")
        return true;
    } else if (code == 2012) {
        myAlertBottom("O número pode ter no máximo 10 caracteres")
        return true;
    } else if (code == 2013) {
        myAlertBottom("A operadora pode ter no máximo 30 caracteres")
        return true;
    } else if (data && data["server"].length < 3) {
        myAlertBottom("Informe no mínimo 3 caracteres para o servidor IP.")
        return true;
    } else if (code == 2014) {
        myAlertBottom("O servidor pode ter no máximo 32 caracteres")
        return true;
    } else if (code == 2021) {
        myAlertBottom("O contrato deve possuir, no máximo, 500 caracteres.")
        return true;
    } else if (code == 2015) {
        myAlertBottom("No banco de dados, o status pode ter somente 1 caracter.")
        return true;
    } else if (code == 2016) {
        myAlertBottom("A data pode ter no máximo 10 caracteres")
        return true;
    } else if (code == 2017) {
        myAlertBottom("Falha ao adicionar o número.")
        return true;
    } else if (code == 2020) {
        myAlertBottom("Esse número já foi cadastrado.")
        return true;
    } else if (code == 9999) {
        myAlertBottom("Erro não recuperável")
        return true;
    } else if (code == 201) {
        myAlertBottom("Ocorreu um erro ao deletar esse número. Verifique o banco de dados.")
    } else if (code == 201.1) {
        myAlertBottom("Erro ao localizar o ID no banco de dados.")
    } else if (code == 201.2) {
        myAlertBottom("Selecione ao menos um número para ser removido.");
    } else if (code == 400) {
        myAlertBottom("Ocorreu um erro ao encaminhar informações ao servidor.");
    } else if (code) {
        myAlertBottom("Erro diferente")
        return true;
    }
}

$(".remover").on("click", function () {
    checkbox = $(":checkbox:checked").not("input[name='first']").not("#darkModeSwitch")
    if (checkbox && checkbox.length > 0) {
        checkbox.each(function (index, value) {
            painho = value.parentNode.parentNode.parentNode
            $.ajax({
                url: "requests.php",
                type: "POST",
                data: "id=" + painho.getAttribute("id"),
                dataType: "JSON"
            }).done(function (resposta) {
                if (resposta["code"] == 200) {
                    $(painho).empty();
                    myAlertTop("Número deletado com sucesso.")
                    updateListClient($("#filterInput").val())
                } else if (getValidadores(null, resposta["code"])) {
                    return
                }
            }).fail(function (jqXHR, textStatus) {
                console.log("Request failed: " + textStatus);

            }).always(function () {
                console.log("completou");
            });
        })
    } else {
        myAlertBottom("Selecione ao menos um número para ser removido.");
    }
})

function editar() {
    checkbox = $(":checkbox:checked").not("input[name='first']").not("#darkModeSwitch")
    if (checkbox && checkbox.length == 1) {
        checkbox.each(function (index, value) {
            painho = value.parentNode.parentNode.parentNode
            id = $(painho).attr("id")
            data = false;
            for (let i = 0; i < listaNumeros.length; i++) {
                if (listaNumeros[i]["ID"] == id) {
                    data = listaNumeros[i]
                }
            }
            if (data) {
                date = data.date ?? ""
                date = date.replace(/\D/g, '')
                date = date.substring(0, 2) + '-' + date.substring(2, 4) + '-' + date.substring(4, 8);
                if (data) {
                    $('#exampleModal').modal('show')
                    $('#validationDefault00').prop("value", data.ID)
                    $('#validationDefault01').prop("value", data.name)
                    $('#validationDefault06').prop("value", listaLinks[data.name])
                    $('#validationDefault02').prop("value", data.number)
                    $('#validationDefault02').attr('disabled', 'disabled');
                    $('#inputState').prop("value", data.operator)
                    $('#validationDefault03').prop("value", data.server)
                    $('#inputState2').prop("value", ["Ativo", "Suspenso", "Cancelado"][data.stats - 1])
                    $('#validationDefault04').prop("value", date ?? "")
                    $('#exampleModalLabel').text("Editar Número")
                    // chamar o php para validar a permissão (que nem tem) e depois chamar esse bloco de código novamente para exibir o modal e manter uma variável ativa no php.
                    // Quando clicar em adicionar, também chamar o php para validar a permissão e retornar o modal após isso. Quando o modal for fechado, também chamar o PHP para informar.
                    // Dessa forma, será possível identificar quando estou editando ou criando algo novo.
                }
            } else {
                myAlertBottom("Falha ao obter dados do número. Atualize a página e tente novamente.")
            }
        })
    } else {
        myAlertBottom("Selecione um, e somente um, número.")
    }
}
$("#editar").on("click", editar)

function editar2() {
    selectedList = 0
    selected = false
    var itens = document.getElementsByClassName("checkbox");
    for (let i = 1; i <= itens.length - 1; i++) {
        if (itens[i].checked) {
            selectedList++;
            selected = listaNumeros[i - 1];
        }
    }
    if (selectedList <= 0 || selectedList > 1) {
        myAlertBottom("Selecione um, e somente um, número.")
    } else {
        date = selected.date ?? ""
        date = date.replace(/\D/g, '')
        date = date.substring(0, 2) + '-' + date.substring(2, 4) + '-' + date.substring(4, 8);
        if (selected) {
            $('#exampleModal').modal('show')
            $('#validationDefault00').prop("value", selected.ID)
            $('#validationDefault01').prop("value", selected.name)
            $('#validationDefault06').prop("value", listaLinks[selected.name])
            $('#validationDefault02').prop("value", selected.number)
            $('#validationDefault02').attr('disabled', 'disabled');
            $('#inputState').prop("value", "IDT")
            $('#validationDefault03').prop("value", selected.server)
            $('#inputState2').prop("value", ["Ativo", "Suspenso", "Cancelado"][selected.stats - 1])
            $('#validationDefault04').prop("value", date ?? "")
            $('#exampleModalLabel').text("Editar Número")
            // chamar o php para validar a permissão (que nem tem) e depois chamar esse bloco de código novamente para exibir o modal e manter uma variável ativa no php.
            // Quando clicar em adicionar, também chamar o php para validar a permissão e retornar o modal após isso. Quando o modal for fechado, também chamar o PHP para informar.
            // Dessa forma, será possível identificar quando estou editando ou criando algo novo.
        }
    }
}
$("#edit2ar").on("click", editar)

function myAlertTop(msg, time = 1.5) {
    $(".myAlert-top").text(msg ?? "N/A");
    $(".myAlert-top").show();
    setTimeout(function () {
        $(".myAlert-top").hide();
    }, time * 1000);

}

function myAlertBottom(msg, time = 1.5) {
    $(".myAlert-bottom").text(msg ?? "N/A");
    $(".myAlert-bottom").show();
    setTimeout(function () {
        $(".myAlert-bottom").hide();
    }, time * 1000);
}

$("#darkModeSwitch").on('change', function () {
    if (this.checked) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
        localStorage.setItem('bsTheme', 'dark');
    } else {
        document.documentElement.setAttribute('data-bs-theme', 'light');
        localStorage.setItem('bsTheme', 'light');
    }
});

paginacao = 1
paginas = 0

function getPaginationAndData() {
    paginas = parseInt(Math.ceil(listaNumeros.length / 200))
    $(".footer").empty();
    footer =
        '<nav style="cursor:default">' +
        '<ul class="pagination justify-content-center table-responsive">' +
        '<li class="page-item ' + (paginacao <= 1 ? "disabled" : "") + ' page-link" data-paginacao="anterior">Anterior</li>' +
        '<li class="page-item page-link ' + (paginacao == 1 ? "active" : "") + '" data-paginacao=1>1</li>'
    for (let index = 2; index < paginas+1; index++) {
        if (index > 5) {
            footer = footer + '<li class="page-item page-link ' + (paginacao > 5 ? "active" : "") + '" data-paginacao="...">...</li>';
            break;
        }
        footer = footer + '<li class="page-item page-link ' + (paginacao == index ? "active" : "") + ' " data-paginacao=' + index + '>' + index + '</li>';
    }
    footer = footer +
        '<li class=\"page-item page-link ' + ((paginas <= 1 || paginacao >= paginas) ? "disabled" : "") + '"data-paginacao=\"proximo\">Próximo</li>' +
        '</ul>' +
        '</nav>'

    $(".footer").append(footer);
    $(".footer li ").on("click", clickPage)
    $('#tbodi').empty()
    for (let index = 1; index <= 200; index++) {
        const element = listaNumeros[((paginacao - 1) * 200) + index-1];
        if (index <= 200 || paginacao == paginas) {
            adicionarLinha(element)
        }
    }
}

function clickPage() {
    pageID = $(this).attr("data-paginacao")
    if (pageID == "anterior") {
        paginacao--
    } else if (pageID == "proximo") {
        paginacao++
    } else {
        if (pageID != "...") {
            paginacao = pageID
        }
    }
    getPaginationAndData()
}

updateListClient()
