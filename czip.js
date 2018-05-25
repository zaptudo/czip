// usado para medir o tempo total de execução
let tempoInicioExecucao = new Date();

// import lib para acesso ao file system
const fileSystem = require('fs');


if(!process.argv[3]){
    console.error('Caminho inválido');
}

if(process.argv[2] == 'c'){
    compactar(caminhoArquivo);
}

if(process.argv[2] == 'x'){
    descompactar(caminhoArquivo);    
}


class BufferWriter {

    constructor(length){
        this.buffer = Buffer.alloc(length, 0);
        this.byteIndex = 0;
        this.writtenBits = 0;
    }

    write(byte, length){

        for(let bitOffset = length - 1; bitOffset >= 0; bitOffset--){

            this.buffer[this.byteIndex] = this.buffer[this.byteIndex] << 1;

            this.buffer[this.byteIndex] = this.buffer[this.byteIndex] | (byte >>> bitOffset);

            this.writtenBits++;

            if(this.writtenBits % 8 == 0){
                this.byteIndex++;
            }
        }
    }

    closeBuffer(){

        let shift = !!this.writtenBits % 8 ? 8 - this.writtenBits % 8 : 0;

        this.buffer[this.byteIndex] = this.buffer[this.byteIndex] << shift;
    }

    getBuffer(){
        return this.buffer;
    }

}

class No {

    constructor(filhoEsquerda, filhoDireita, byte, frequencia) {
        this.filhoEsquerda = filhoEsquerda;
        this.filhoDireita = filhoDireita;
        this.byte = byte;
        this.frequencia = frequencia;
    }

    isFolha() {
        return !this.filhoEsquerda && !this.filhoDireita;
    }
}

class ArvoreHuffman {

    constructor(bufferArquivo) {

        this.qtdBitsCompactado = 0;
        this._bufferArquivo = bufferArquivo;
        this._raiz = this._criarArvoreHuffman(this._calcularFrequencia(this._bufferArquivo));
        this._tabelaCodificacao = [];
        this._gerarTabelaCodificacao(this._raiz);        
    }

    imprimirTabelaCodificacao(){

        console.log(`Caracter (frequencia) -> Codigo`);

        for(let i = 0; i < this._tabelaCodificacao.length; i++){

            if(!this._tabelaCodificacao[i]){
                continue;
            }

            console.log(`${String.fromCharCode(i)} (${this._tabelaCodificacao[i].frequencia}) -> ${this._tabelaCodificacao[i].codigoStr}`);
        }
    }

    getMetadados(){
        
        let tamanhoCabecalho = (this._tabelaCodificacao.filter(elemento => elemento !== null && elemento !== undefined && elemento.frequencia > 0).length * 6) + 12;

        let cabecalho = Buffer.alloc(tamanhoCabecalho, 0);

        cabecalho.writeInt32BE(tamanhoCabecalho, 0);
        cabecalho.writeInt32BE(this._bufferArquivo.length, 4);
        cabecalho.writeInt32BE(this.qtdBitsCompactado, 8);

        let deslocamento = 12;
        for(let i = 0; i < this._tabelaCodificacao.length; i++){

            if(this._tabelaCodificacao[i] === null || this._tabelaCodificacao[i] === undefined || this._tabelaCodificacao[i].frequencia === 0){
                continue;
            }

            let valor = i;
            let codigo = this._tabelaCodificacao[i].codigo;
            let qtdBitsCodigo = this._tabelaCodificacao[i].tamanho;

            cabecalho.writeUInt8(qtdBitsCodigo, deslocamento)
            cabecalho.writeInt32BE(codigo, deslocamento + 1)
            cabecalho.writeUInt8(valor, deslocamento + 5);

            deslocamento = deslocamento + 6;
        }

        return cabecalho;
    }

    comprimir(){

        // Criar buffer de resultado
        this.qtdBitsCompactado = this._tabelaCodificacao.map(byte => byte.frequencia * byte.tamanho).reduce((acc, atual, index, array) => acc + atual, 0);
        let tamanhoArquivoComprimidoEmBytes = (this.qtdBitsCompactado / 8) + 1


        let writter = new BufferWriter(tamanhoArquivoComprimidoEmBytes);

        // Percorrer o buffer de origem
        for(let byte of this._bufferArquivo){

            // Obter código para o byte
            let codigo = this._tabelaCodificacao[byte].codigo;
            let tamanho = this._tabelaCodificacao[byte].tamanho;

            writter.write(codigo, tamanho);
        }

        writter.closeBuffer();

        let cabecalho = this.getMetadados();
        let arquivoComprimido = writter.getBuffer();
        return Buffer.concat([cabecalho, arquivoComprimido], cabecalho.length + arquivoComprimido.length);
    }


    _calcularFrequencia(bufferArquivo){

        let frequencia = new Array(256);
        frequencia.fill(0, 0, 256);

        for(let byte of bufferArquivo){
            frequencia[byte]++;
        }

        return frequencia;
    }

    _criarArvoreHuffman(arrayFrequencia){

        // Criar lista de nós somente com os elementos que possuem frequencia
        let listaNos = [];
        for(let byte = 0; byte < arrayFrequencia.length; byte++){

            if(arrayFrequencia[byte] == 0){
                continue;
            }

            listaNos.push(new No(null, null, byte, arrayFrequencia[byte]));
        }

        // repetir até que a lista de nós só tenha um nó, que será a raiz da árvore
        while(listaNos.length > 1){

            // Ordernar lista de nós por frequencia
            listaNos = listaNos.sort( (a, b) => a.frequencia < b.frequencia ? 1 : -1 );

            // Criar sub-árvore para os dois nós de menor frequencia e incluir na lista
            listaNos.push(this._criarSubArvore(listaNos.pop(), listaNos.pop()));        
        }

        return listaNos[0];
    }
    
    _criarSubArvore(filhoEsquerda, filhoDireita){

        return new No(filhoEsquerda, filhoDireita, null, filhoEsquerda.frequencia + filhoDireita.frequencia);
    }

    _gerarTabelaCodificacao(){

        this._visitarNo(this._raiz, "");
    }

    _visitarNo(no, caminho){

        if(!!no.isFolha()){

            this._tabelaCodificacao[no.byte] = {
                codigo: parseInt(caminho, 2),
                tamanho: caminho.length,
                codigoStr: caminho,
                frequencia: no.frequencia
            };
        }

        if(!!no.filhoEsquerda){
            this._visitarNo(no.filhoEsquerda, caminho + "0");
        }

        if(!!no.filhoDireita){
            this._visitarNo(no.filhoDireita, caminho + "1");
        }
    }
}

function getFilho(no, direcao){

    if(!no){
        throw new Error("O nó é nulo");
    }

    if(direcao === 0){

        if(!no.filhoEsquerda){
            throw new Error("O nó não possui filho à esquerda");
        }
        
        return no.filhoEsquerda;
    }

    if(direcao === 1){

        if(!no.filhoDireita){
            throw new Error("O nó não possui filho à direita");
        }
        
        return no.filhoDireita;
    }
}

function readMetadados(bufferArquivo){

    let metadados = {
        tamanhoOriginalArquivo: 0,
        offsetDados: 0,
        qtdBitsCompactado: 0,
        tabela: []
    };

    let tamanhoCabecalho = bufferArquivo.readInt32BE(0);
    metadados.offsetDados = tamanhoCabecalho;
    metadados.tamanhoOriginalArquivo = bufferArquivo.readInt32BE(4);
    metadados.qtdBitsCompactado = bufferArquivo.readInt32BE(8);
    let qtdBlocos = (tamanhoCabecalho - 12) / 6;

    let deslocamento = 12;
    for(let indice = 0; indice < qtdBlocos; indice++){

        let qtdBitsCodigo = bufferArquivo.readUInt8(deslocamento);
        let codigo = bufferArquivo.readInt32BE(deslocamento + 1);
        let valor = bufferArquivo.readUInt8(deslocamento + 5);

        metadados.tabela.push({
            codigo: codigo, 
            qtdBitsCodigo: qtdBitsCodigo,
            valor: valor
        });

        deslocamento = deslocamento + 6;
    }

    return metadados;
}

function getBit(buffer, posicao){

    let byteIndex = (posicao / 8) | 0;
    let bitIndex = 7 - posicao % 8;

    return +(((buffer[byteIndex] >> bitIndex) & 0x01) > 0);
}

function abrirArquivo(caminhoArquivo){
    return fileSystem.readFileSync(caminhoArquivo);
}

function salvarArquivo(caminhoArquivo, bufferArquivo){
    return fileSystem.writeFileSync(caminhoArquivo, bufferArquivo);
}

function compactar(caminhoArquivo){

    console.log(`Compactando o arquivo ${caminhoArquivo}...`);

    let bufferArquivo = abrirArquivo(caminhoArquivo);

    let arvoreHuffman = new ArvoreHuffman(bufferArquivo);

    let bufferArquivoComprimido = arvoreHuffman.comprimir();
    
    fileSystem.writeFileSync(caminhoArquivo + '.czip', bufferArquivoComprimido);

    console.log("Concluído.")
    console.log("Tamanho do original do arquivo: " + bufferArquivo.length + " bytes");
    console.log("Tamanho do arquivo comprimido: " + bufferArquivoComprimido.length + " bytes");
    console.log("Tempo de processamento " + (new Date().getTime() - tempoInicioExecucao.getTime()) + " ms");
}

function remontarArvore(metadados){

    // inicializa a raiz da árvore
    let raiz = new No(null, null, null, null);

    // Percorre a tabela de codificação
    for(let indiceSimbolo = 0; indiceSimbolo < metadados.tabela.length; indiceSimbolo++){

        // Obtém o código de acordo com o tamanho
        let buffer = Buffer.alloc(4);

        let qtdBitsCodigo = metadados.tabela[indiceSimbolo].qtdBitsCodigo;

        buffer.writeInt32BE(metadados.tabela[indiceSimbolo].codigo << (32 - qtdBitsCodigo));
        let valor = metadados.tabela[indiceSimbolo].valor;

        let noAtual = raiz;
        for(let posicaoBitLeitura = 0; posicaoBitLeitura < qtdBitsCodigo; posicaoBitLeitura++){

            // Lê o código bit a bit 
            let bit = getBit(buffer, posicaoBitLeitura);

            // Cria os nós
            if(bit === 0){

                if(!!noAtual.filhoEsquerda){

                    noAtual = noAtual.filhoEsquerda;

                } else {

                    noAtual.filhoEsquerda = new No(null, null, null, null);
                    noAtual = noAtual.filhoEsquerda;
                }
            }

            if(bit === 1){

                if(!!noAtual.filhoDireita){

                    noAtual = noAtual.filhoDireita;

                } else {

                    noAtual.filhoDireita = new No(null, null, null, null);
                    noAtual = noAtual.filhoDireita;
                }
            }
        }

        noAtual.byte = valor;
    }

    return raiz;
}

function decodificar(bufferArquivoComprimido, metadados, raizArvoreHuffman){

    let index = 0;
    let bufferArquivoDescomprimido = Buffer.alloc(metadados.tamanhoOriginalArquivo);
    let noAtual = raizArvoreHuffman;
    for(let posicaoBit = metadados.offsetDados * 8; posicaoBit < (metadados.qtdBitsCompactado + metadados.offsetDados * 8); posicaoBit++){
        
        noAtual = getFilho(noAtual, getBit(bufferArquivoComprimido, posicaoBit));

        if(noAtual.isFolha()){            

            bufferArquivoDescomprimido.writeUInt8(noAtual.byte, index);

            noAtual = raizArvoreHuffman;

            index++;            
        }   
    }

    return bufferArquivoDescomprimido;
}

function descompactar(caminhoArquivo){

    console.log(`Descompactando o arquivo ${caminhoArquivo}...`);

    let bufferArquivoComprimido = abrirArquivo(caminhoArquivo);

    let metadados = readMetadados(bufferArquivoComprimido);

    let raiz = remontarArvore(metadados);


    let bufferArquivoDescomprimido = decodificar(bufferArquivoComprimido, metadados, raiz);


    salvarArquivo(String(caminhoArquivo).replace('.txt.czip', '-descompactado.txt'), bufferArquivoDescomprimido)

    console.log("Concluído.")
    console.log("Tempo de processamento " + (new Date().getTime() - tempoInicioExecucao.getTime()) + " ms");
}