<?php

use FFI\Exception;
date_default_timezone_set('America/Sao_Paulo');

$database = false;

class databaseCls
{
  public $section = false;

  public function __construct()
  {
    $dB = new mysqli("10.5.24.182", "root", "nDEIfhV65F");
    if ($dB->error) {
      $this->section = false;
      error_log("\n\n" . $dB->connect_error, 3, "log.txt");
      die("Falha ao conectar " . $dB->connect_error);
    } else {
      $this->section = $dB;
      error_log("\n\nBanco de dados conectado com sucesso", 3, "log.txt");
    }
  }


  public function createDatabase()
  {
    if (!$this->section) {
      return;
    }
    $this->section->select_db("voip");
    $this->section->query("CREATE TABLE IF NOT EXISTS numeros(ID INT(5) AUTO_INCREMENT, name TEXT(200),number BIGINT(20),operator TEXT(30),server TEXT(32),stats INT(1),_date date,PRIMARY KEY (ID))");
    $this->section->query("CREATE TABLE IF NOT EXISTS links(ID INT(5) AUTO_INCREMENT, name TEXT(200), link TEXT(500), PRIMARY KEY (ID))");
    return True;
  }

  public function getTable($tabela, $filtro = "", $filtro2 = "")
  {
    if ($tabela == "numeros") {
      $wheree = "";
      if ($filtro != "") {
        $wheree = "WHERE ID LIKE '%$filtro%' or name LIKE '%$filtro%' or number LIKE '%$filtro%' or operator LIKE '%$filtro%' or server LIKE '%$filtro%' or _date LIKE '%$filtro%'";
        if ($filtro2 != "") {
          $wheree = $wheree . " OR stats LIKE '%$filtro2%' ";
        }
      }
      $data = $this->section->query("SELECT * FROM numeros $wheree ORDER BY ID DESC");
      $toResult = [];
      while ($row = mysqli_fetch_array($data)) {
        array_push($toResult, [
          "ID" => $row["ID"],
          "name" => $row["name"],
          "number" => $row["number"],
          "operator" => $row["operator"],
          "server" => $row["server"],
          "stats" => $row["stats"],
          "date" => date_format(date_create($row["_date"]), "d/m/Y"),

        ]);
      }
      return $toResult;
    } else if ($tabela == "links") {
      $data = $this->section->query("SELECT * FROM `links` ");
      $toResult = [];
      while ($row = mysqli_fetch_array($data)) {
        $toResult[$row["name"]] = $row["link"];
      }
      return $toResult;
    }
  }

  function existsNumber($number)
  {
    global $dB;
    $query = sprintf("SELECT * FROM `numeros` WHERE number ='%s'", $this->section->real_escape_string($number));
    $data = $this->section->query($query);
    if ($data->num_rows > 0) {
      return $data->fetch_assoc();
    }
  }

  function existsEmpresa($name)
  {
    global $dB;
    $query = sprintf("SELECT name FROM `numeros` WHERE name ='%s'", $this->section->real_escape_string($name));
    $data = $this->section->query($query);
    if ($data->num_rows > 0) {
      return true;
    }
  }

  public function removeItem($type, $value)
  {
    try {
      if ($type == "numero") {
        $query = sprintf("DELETE FROM numeros WHERE ID = %s", $this->section->real_escape_string($value));
      } else if ($type == "link") {
        $query = sprintf("DELETE FROM links WHERE name = '%s'", $this->section->real_escape_string($value));
      }
      $this->section->query($query);
    } catch (Exception $e) {
      throw new Exception("Exceptionou", 1);
    }
  }

  public function addItem($data, $type)
  {
    if ($type == "link") {
      $result = $this->section->execute_query("INSERT INTO links (name, link) VALUES(?, ?)", [$data["nome"], (string) $data["link"]]);
      return $result;
    } else if ($type == "numero") {
      $result = $this->section->execute_query("INSERT INTO numeros (name, number, operator, server, stats, _date) VALUES(?, ?, ?, ?, ?, ?)", [$data["nome"], $data["numero"], $data["operator"], $data["server"], $data["status"], $data["data"]]);
      return $result;
    }
  }

  public function updateItem($data, $type)
  {
    if ($type == "link") {
      $query = sprintf("UPDATE links SET name = '%s', link = '%s' WHERE name = '%s'", ...$data);
      $this->section->execute_query($query);
    } elseif ($type == "numero") {
      $query = sprintf("UPDATE numeros SET name = '%s', operator = '%s', server = '%s', stats ='%s', _date = '%s' WHERE ID = '%s'", ...$data);
      $this->section->execute_query($query);
    }
  }

  public function close(): void
  {
    $this->section->close();
  }

}

//startDatabaseDados();

function startDatabaseDados()
{
  global $database;
  if (!$database) {
    $database = new databaseCls();
    $database->section->select_db("voip");
  }
  if ($database->createDatabase()) {
    //echo "createDatabase() Rodou com sucesso\n";
    $links = $database->getTable("links") ?? [];

    if (!array_key_exists("AMERICANET", $links)) {
      $database->section->query("INSERT INTO links (name,link) Values ('AMERICANET', '179.127.199.66')");
    }
    if (!array_key_exists("IDT", $links)) {
      $database->section->query("INSERT INTO links (name,link) Values ('IDT', '177.10.199.6')");
    }
    if (!array_key_exists("GOLDCOM", $links)) {
      $database->section->query("INSERT INTO links (name,link) Values ('GOLDCOM', '179.127.199.132')");
    }
    if (!array_key_exists("VONEX", $links)) {
      $database->section->query("INSERT INTO links (name,link) Values ('VONEX', '')");
    }
    /* if(!array_key_exists("OI", $links)){
       $database->section->query("INSERT INTO links (name,link) Values ('OI', '179.127.199.66')");
     }*/

  } else {
    // echo "Ocorreu um erro ao conectar no banco e dados e criar a tabela.\n";
  }

}
function updateDatabase($data)
{
  global $dB;
  $id = $data["ID"];
  $name = $data["name"];
  $number = $data["number"];
  $operator = $data["operator"];
  $server = $data["server"];
  $stats = $data["stats"];
  $cancellationDate = $data["cancellationDate"];
  return $dB->query("UPDATE numeros SET name = '$name', number = '$number', operator = '$operator', server = '$server', stats ='$stats', cancellationDate = '$cancellationDate' WHERE ID = '$id'");
}


