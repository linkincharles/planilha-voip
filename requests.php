<?php

include "controller.php";

$get = $_GET;
if ($get) {
  if (!$database) {
    startDatabaseDados();
    //sleep(1);
  }
  header('Content-Type: application/json');
  if ($database) {

    if (!key_exists("page", $get)) {
      $get["page"] = "N/A";
    }

    if ($get["page"] == "getByID") {
    } else {
      $status = null;
      if (array_key_exists("filtro", $get)) {
        foreach (["Ativo", "Suspenso", "Cancelado"] as $key => $value) {
          if (str_contains(strtoupper($value), strtoupper($get["filtro"]))) {
            $status = $key;
            break;
          }
        }
      }
      echo json_encode(
        [
          "numeros" => $database->getTable("numeros", $get["filtro"] ?? "", $status) ?? [],
          "links" => $database->getTable("links") ?? [], // colocar um filtro nos links também
          "code" => 1,
        ]
      );
    }

  } else {
    echo json_encode(["code" => 400]);
  }
}

$post = $_POST;
if ($post) {
  if (!$database) {
    startDatabaseDados();
    //sleep(1);
  }
  global $database;
  if (array_key_exists("id", $post)) {
    if (empty($post["id"])) {
      echo json_encode(["code" => 201.2]);
      return;
    }
    if ($database) {
      $item = false;
      try {
        foreach (($database->getTable("numeros") ?? []) as $key => $value) {
          if ((int) $value["ID"] == (int) $post["id"]) {
            $item = $value["name"];
            $database->removeItem("numero", $post["id"]);
            break;
          }
        }
        if ($item) {
          error_log("\n\nCompletou o remover 1 .", 3, "log.txt");
          if (!$database->existsEmpresa($item)) {
            error_log("\n\nCompletou o remover 2 .", 3, "log.txt");
            try {
              $database->removeItem("link", $item);
            } catch (Exception $e) {
              error_log("\n\nCompletou o remover  3." . $e, 3, "log.txt");
            }
            error_log("\n\nCompletou o remover  4.", 3, "log.txt");
          }
          echo json_encode(["code" => 200]);
        } else {
          echo json_encode(["code" => 201.1]);
        }
      } catch (Exception $e) {
        echo json_encode(["code" => 203]);
      }
    } else {
      echo json_encode(["code" => 201]);
      //header("HTTP/1.1 201 OK");
    }
  } else if (array_key_exists("name", $post)) {
    echo json_encode(["code" => 202]);
  } else if (array_key_exists("data", $post)) {
    $data = json_decode($post["data"], true);
    
    if ($data["data"] == "") {
      $data["data"] = date("Y/m/d");
    }
    $data["contrato"] = array_map('urldecode', [$data["contrato"]])[0];

    $data = verifiySpaces($data);

    $data["contrato"] = verifiyURL($data["contrato"]) ?? $data["contrato"];
    $data["server"] = verifiyURL($data["server"]) ?? $data["server"];

    $inputsReady = validarInputs($data);
    if ($inputsReady) {
      $data["status"] = ["Ativo" => 1, "Suspenso" => 2, "Cancelado" => 3][$data["status"]];
      $data["data"] = date("Y-m-d", date_timestamp_get(date_create($data["data"])));

      if ($data["id"]) {
        updateColumns($data);
      } else {
        createNumber($data);
      }
    } else {
      echo json_encode(["code" => $inputsReady]);
    }
  } else {
    echo json_encode(["code" => 400]);
  }
}

function updateColumns($data)
{
  global $database;
  $ID = $data["id"];
  $datinha = [$data["nome"], $data["operator"], $data["server"], $data["status"], $data["data"], $ID];
  $number = $database->existsNumber($data["numeros"]);
  $database->updateItem($datinha, "numero");
  sleep(0.1);
  $empresa = $database->existsEmpresa($number["name"]);
  if ($empresa || !$number) {
    $database->addItem(["nome" => $data["nome"], "link" => $data["contrato"]], "link");
  } else {
    $database->updateItem([$data["nome"], $data["contrato"], $number["name"]], "link");
  }
  echo json_encode([$number["name"], $data["id"], "code" => 2002.2]);
}

function verifiyURL($texto){
  try{
    if(strlen($texto) > 0){
      if(!str_contains($texto , "http://") && !str_contains($texto, "https://")){
          return "http://".$texto;
      }
    }
  }catch(Exception $e){
    throw new Exception($e);
  }
  
}

function verifiySpaces($data){
  if(count($data) > 0){
    $dataReturn = [];
    foreach ($data as $k => $v) {
      $dataReturn[$k] = trim($v);
    }
    return $dataReturn;
  }
  return $data;
}

function paramsInvalid($number = ""){
  $codeReturn;
  if(ctype_alpha($number)){
    return true;
  }
}

function validarInputs($data)
{
  if (strlen($data["data"]) < 10) {
    return 2003;
  } else if (strlen($data["nome"]) < 4) {
    return 2009;
  } else if (strlen($data["contrato"]) > 500) {
    return 2021;
  } else if (strlen($data["numeros"]) < 3) {
    return 2005;
  } else if ($data["operator"] != "AMERICANET" && $data["operator"] != "IDT" && $data["operator"] != "GOLDCOM" && $data["operator"] != "OI" && $data["operator"] != "VONEX" && $data["operator"] != "OPERADORANOVA2") {
    return 2006;
  } else if (strlen($data["server"]) < 8) {
    return 2007;
  } else if ($data["status"] != "Ativo" && $data["status"] != "Suspenso" && $data["status"] != "Cancelado") {
    return 2008;
  } else if (strlen($data["nome"]) > 500) {
    return 2011;
  } else if (strlen($data["operator"]) > 30) {
    return 2013;
  } else if (strlen($data["server"]) > 32) {
    return 2014;
  } else if (strlen($data["status"]) > 1) {
    return 2015;
  } else if (strlen($data["data"]) > 10) {
    return 2016;
  }
}

function createNumber($data)
{
  global $database;

  $data["numero"] = $data["numeros"];

  $numeros = explode(",", $data["numeros"]);
  $data["numeros"] = null;
  $falhaExito = [
    "numerosExito" => [],
    "numerosFalha" => [],
  ];
  foreach ($numeros as $k => $numero) {
    if (strlen($numero) >= 3) {
      try {

        $numerosRange = getRangeNumbers($numero) ?? [$numero];
        foreach ($numerosRange as $key => $v) {
          $data["numero"] = $v;
          $exitsNumber = $database->existsNumber($data["numero"])["name"];
          sleep(0.05);
          if (!$exitsNumber) {
            if (strlen($data["numero"]) > 20) {
              array_push($falhaExito["numerosFalha"], $data["numero"] . "(Número maior que 20 caracteres)");
              continue;
            }
            $checkParams = paramsInvalid($data["numero"]);
            if($checkParams){
              array_push($falhaExito["numerosFalha"], $data["numero"] . "(Não é um número de telefone)");
              continue;
            }
            $addItem = $database->addItem($data, "numero");
            if ($addItem) {
              array_push($falhaExito["numerosExito"], $data["numero"]);
            } else {
              array_push($falhaExito["numerosFalha"], $data["numero"] . "(Falha crítica)");
            }
          } else {
            array_push($falhaExito["numerosFalha"], $data["numero"] . "(Número sendo utilizado por " . ($exitsNumber ?? "N/A") . ")");
            //echo json_encode(["owner" => $exitsNumber, "code" => 2020]);
            continue;
          }
        }
      } catch (Exception $e) {
        //echo json_encode(["code" => 9999]);
        array_push($falhaExito["numerosFalha"], $data["numero"]);
        continue;
      }
    }
    if (!array_key_exists($data["nome"], $database->getTable("links") ?? [])) {
      if (strlen($data["contrato"]) > 0) {
        $addItem = $database->addItem(["nome" => $data["nome"], "link" => $data["contrato"]], "link");
      }
    }
  }

  echo json_encode(["data" => $falhaExito, "code" => 2002]);

}


function getRangeNumbers($text)
{
  if (strpos($text, "-")) {
    $listReturn = [];
    list($start, $end) = explode("-", $text);
    $range = range($start, $end);
    return $range;
  } else {
    return [$text];
  }
}

