<?php
header("Cache-Control: no-cache, no-store, must-revalidate"); // HTTP 1.1.
header("Pragma: no-cache"); // HTTP 1.0.
header("Expires: 0"); // Proxies.
?>

<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>Ramais | AFINET</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"
        integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <link rel="stylesheet" href="./style.css">
    <style>
        .footer {
            position: fixed !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            color: white !important;
            text-align: center !important;
        }

        .collapse1 {
            overflow-y: scroll !important;
            height: 700px !important;
            padding-bottom: 20px !important;
        }
    </style>
</head>

<body>
    <div class="myAlert-top alert alert-success">Ocorreu um êxito.</div>
    <div class="myAlert-bottom alert alert-danger">Ocorreu um erro.</div>
    <div>
        <nav style="padding: 20px" class="navbar navbar-expand-lg">
            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="darkModeSwitch" checked>
                <label class="form-check-label" for="darkModeSwitch">Modo escuro</label>
            </div>
        </nav>
        <nav class="navbar navbar-expand-lg" style="padding: 20px">
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false"
                aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarSupportedContent">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <div id="botoes">
                        <button class="btn btn-primary" onclick="adicionar()" id="adicionar">Adicionar</button>
                        <button class="remover btn btn-danger" id="remover">Remover</button>
                        <button class="btn btn-secondary" id="editar">Editar</button>
                    </div>
                </ul>
                <div class="d-flex" role="search">
                    <input class="form-control me-2" id="filterInput" type="search"
                        placeholder="ID, Empresa, Número, Operadora, Servidor ou Status" aria-label="Search">
                    <button class="btn btn-outline-success" id="filtrar">Filtrar</button>
                </div>
            </div>
        </nav>
    </div>

    <div>
        <p id="qtdResult" style="text-align:center">0 resultados</p>
    </div>
    <div class="collapse1">
        <table id="table" class="table table-responsive">
            <thead>
                <tr>
                    <th>
                        <div class="form-check"><input name="a" class="checkbox form-check-input" type="checkbox"></div>
                    </th>
                    <th>ID</th>
                    <th>Empresa</th>
                    <th>Número</th>
                    <th>Operadora</th>
                    <th>Servidor</th>
                    <th>Status</th>
                </tr>
            </thead>

            <tbody id="tbodi">
            </tbody>
        </table>
    </div>

    <div class="footer">
        
    </div>

    <div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel"
        aria-hidden="true">
        <div class="myAlert-top alert alert-success">Ocorreu um êxito.</div>
        <div class="myAlert-bottom alert alert-danger">Ocorreu um erro.</div>
        <div class="modal-dialog" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="exampleModalLabel">Novo número</h5>
                </div>
                <div class="modal-body">
                    <form id="form" method="POST">
                        <div class="form-row">
                            <div class="visually-hidden col-md-4 mb-3 was-validated">
                                <input type="text" name="numeroID" class="form-control" id="validationDefault00"
                                    placeholder="ID" value="" disabled>
                            </div>
                            <div class="col-md-4 mb-3 was-validated">
                                <label for="validationDefault01">Empresa</label>
                                <input type="text" name="empresaNome" class="form-control" id="validationDefault01"
                                    placeholder="Nome" value="" required>
                                <div id="validationDefault01Feedback" class="invalid-feedback">Informe o nome da empresa
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <label for="validationDefault06">Contrato</label>
                                <input type="text" name="contratoURL" class="form-control" id="validationDefault06"
                                    placeholder="URL Sugar" value="">
                            </div>
                            <div class="col-md-5 mb-3 was-validated">
                                <label for="validationDefault02">Número(s)</label>
                                <input type="text" name="numeros" class="form-control" id="validationDefault02"
                                    placeholder="Separe por vírgula" value="" required>
                                <div id="validationDefault02Feedback" class="invalid-feedback">Informe ao menos um
                                    número</div>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="inputState">Operadora</label>
                                <select name="operadora" id="inputState" class="form-control">
                                    <option selected>AMERICANET</option>
                                    <option>IDT</option>
                                    <option>GOLDCOM</option>
                                    <option>OI</option>
                                    <option>VONEX</option>
                                </select>
                            </div>
                            <div class="form-group col-md-4">
                                <label for="inputState2">Status</label>
                                <select name="status" id="inputState2" class="form-control">
                                    <option selected>Ativo</option>
                                    <option>Suspenso</option>
                                    <option>Cancelado</option>
                                </select>
                            </div>
                            <div class="col-md-5 mb-3 was-validated">
                                <label for="validationDefault03">Servidor</label>
                                <input name="servidor" type="text" class="form-control" id="validationDefault03"
                                    placeholder="IP" value="" required>
                                <div id="validationDefault03Feedback" class="invalid-feedback">Informe o URL do servidor
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <label for="validationDefault04">Data</label>
                                <input name="data" type="text" class="form-control" id="validationDefault04"
                                    placeholder="dia-mês-ano" value="" required>
                            </div>
                        </div>
                </div>

                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary close" data-dismiss="modal" onclick="$('#exampleModal').modal('hide')">Fechar</button>
                    <button type="submit" id="salvar" class="btn btn-primary">Salvar</button>
                </div>
            </div>

        </div>
    </div>

    <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"
        crossorigin="anonymous"></script>
    <script type="text/javascript" src="./script.js"></script>
</body>

</html>