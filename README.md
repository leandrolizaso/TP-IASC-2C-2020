# TP-IASC-2C-2020

### Grupo 1
#### Integrantes:
* Paco Erik
* Leandro Lizaso
* Matías Villanueva
* Germán Cáceres
* Juan Cruz Salto

#### Enunciado: [Pigeon, aplicación de mensajería](https://docs.google.com/document/d/1fpWsCJow_u72EGi8vyylG87L9yowCXtDHlzq9KI3G4w/edit)

#### Arquitectura: [Documento de Arquitectura](https://docs.google.com/document/d/1FvLcVKtMntErZsjQEaF-wIQtTrHl4qiGO9QA7x-viLU/edit?usp=sharing)

Se planteó una arquitectura distribuida compuesta por las siguientes partes:
* Un servicio de balanceo de carga y su backup, es el punto de ingreso del cliente al sistema
* Un servicio maestro y su backup, se encarga de administrar el conjunto de nodos
* Nodos, servidores que administran a los clientes para brindar el servicio de chat
* Un servicio de Redis Pubsub para la comunicación entre nodos

#### Instrucciones para la ejecución del sistema
* Tener instalado **node.js** y **yarn**
* Tener instalado el **Docker** y que pueda ser accedido desde la terminal
* Ir al directorio ```/node-pigeon-client``` y ejecutar ```yarn```
* Ir al directorio ```/scripts```
* Ejecutar el script ```./docker_build_all.sh``` para generar las imágenes de cada parte
* Ejecutar el script ```./run_master_balancers_pubsub.sh``` dentro del directorio para ejecutar el **back-end**
* Ejecutar el script ```./client.sh``` por cada cliente que se quiera utilizar
* Para terminar la ejecución del sistema ejecute ```./remove_containers.sh``` para sacar los contenedores generados

#### Instrucciones para generar carga en el sistema
* Tener instalado **artillery** (```yarn global add artillery``` o ```npm install -g artillery```)
* Ir al directorio ```/load-testing```
* Ejecutar el script ```./run_load.sh [yamlScript] [port]``` para ejecutar un script de carga al nodo ubicado en el puerto *port*
* A modo de referencia, los 3 nodos iniciales del sistema tienen los puertos **3011**, **3012** y **3013**

##### Scripts de carga
* ```basic_users_flow.yaml```: simula un uso normal de un nodo con 60 usuarios que chatean entre sí con mensajes cada 1 segundo, se puede observar que no es mucha carga, por lo cual no se escala el sistema si se aplica esta carga, para las siguientes cargas sí se escala
* ```basic_users_high_flow.yaml```: simula un uso alto de un nodo con 60 usuarios que chatean entre sí con mensajes cada 100 milisegundos
* ```group_users_high_load.yaml```: simula un uso exagerado de un nodo con 1000 usuarios que chatean entre sí con mensajes cada 1 segundo
