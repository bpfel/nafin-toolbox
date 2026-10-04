import type { PartialContent } from '../content'

/**
 * Italiano, con il «tu» come nel resto del catalogo. Lo dava già quando il
 * tedesco e il francese davano ancora del Lei; ora lo danno anche loro.
 *
 * E le parole che l’interfaccia usa già: Budget, Conti, Assegnazioni,
 * istantanea, Sapere, Profilo. Un tour che chiama le cose diversamente dalle
 * schermate che spiega non spiega nulla.
 *
 * Completo: il tour e gli articoli. Il modulo resta `Partial` — un articolo
 * aggiunto in seguito può esistere dapprima solo in inglese, e la scheda lo
 * dirà apertamente invece di far passare la lingua di ripiego per una
 * traduzione.
 *
 * Le fonti rimandano alle versioni italiane delle pagine ufficiali. Mandare un
 * lettore italofono su una pagina inglese sarebbe una traduzione a metà.
 */
export const it: PartialContent = {
  tour: {
    welcome: {
      title: 'Un pianificatore',
      body: 'Questa app non ha alcun collegamento con la tua banca e non vede mai le tue spese reali. Il budget dice invece quanto deve restare alla fine del mese, perché gli impegni futuri siano sempre coperti.',
    },
    places: {
      title: 'Le diverse schermate',
      body: 'Budget è dove pianifichi un mese. Conti mostra i saldi reali corrispondenti. Sapere ospita questo tour e brevi testi sulle finanze svizzere.',
    },
    types: {
      title: 'Diverse voci di budget',
      body: 'Ne esistono vari tipi, presentati uno dopo l’altro.',
    },
    budget: {
      title: 'Un piano permanente',
      body: 'Non un registro mensile. Descrivi un mese tipico una volta sola e scatti un’istantanea con un nome quando qualcosa cambia abbastanza da valerne la pena.',
      note: 'A titolo di esempio usiamo alcuni valori svizzeri predefiniti.',
    },
    controls: {
      title: 'I comandi',
      body: 'Tutte le opzioni per la schermata corrente sono qui.',
      hoverNote: 'Passa il puntatore su un simbolo per vedere che cosa fa.',
    },
    accounts: {
      title: 'Conti',
      body: 'Qui c’è tutto ciò che possiedi, in banca o altrove. Aggiungi l’IBAN e i dati che lo accompagnano, e potrai generare QR-fatture pagabili su di esso.',
    },
    allocations: {
      title: 'Assegnazioni',
      body: 'Qui colleghi ogni voce di budget alla provenienza e alla destinazione del suo denaro. Lo stipendio arriva sul conto principale; l’accantonamento per il computer portatile e la fattura Serafe vanno dove non verranno spesi. Ne risultano un saldo per ciascuno e una proiezione delle riserve necessarie.',
    },
    install: {
      title: 'Sulla schermata Home',
      body: 'Installata, l’app si apre come le altre, a schermo intero e senza il browser attorno. Si fa dal menu del browser, in un minuto.',
      note: 'Un altro browser? Cerca il suo nome con «installare web app».',
      links: [
        { label: 'iPhone (Safari)', url: 'https://support.apple.com/it-ch/guide/iphone/iphea86e5236/ios' },
        { label: 'Android (Chrome)', url: 'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=it' },
      ],
    },
    knowledge: {
      title: 'Puoi tornare qui',
      body: 'Il tour riparte da qui, accanto agli articoli su ogni vista e sul franco svizzero. Non devi ricordare nulla di ciò che hai appena visto.',
    },
    sharedWhat: {
      title: 'Condividi la gioia',
      body: 'Un’economia domestica è un secondo budget che puoi condividere con altri.',
    },
    sharedStart: {
      title: 'Configurazione',
      body: 'Le economie domestiche si gestiscono nel profilo.',
    },
    sharedInvite: {
      title: 'Invitare altre persone',
      body: 'Apri un’economia domestica per invitare qualcuno. Per l’invito usa l’e-mail del suo account e passa il link di condivisione — copiato, oppure come codice QR. Decidi tu se può solo leggere il budget condiviso o anche modificarlo.',
    },
    sharedSwitch: {
      title: 'Cambiare budget',
      body: 'Appena appartieni a un’economia domestica gestisci più budget. Il punto indica quello su cui stai lavorando e permette di cambiare.',
      wideBody: 'Appena appartieni a un’economia domestica gestisci più budget. La barra in alto indica quello su cui stai lavorando e permette di cambiare.',
    },
    sharedEntries: {
      title: 'Le diverse voci',
      body: 'Proprio come nel budget personale, un’economia domestica offre gli stessi tipi di voce. Usa quelli che ti servono per pianificare le spese comuni.',
      note: 'Le cifre mostrate sono un esempio, per un’economia domestica di due persone.',
    },
    sharedContributions: {
      title: 'Entrate dell’economia domestica',
      body: 'Il lato entrate di un budget domestico è il più delle volte la somma dei contributi individuali, non un salario intero.',
    },
    sharedKnowledge: {
      title: 'Puoi tornare',
      body: 'Questo percorso riparte da qui, accanto alla visita guidata e agli articoli. Niente di ciò che hai appena visto va ricordato.',
    },
  },
  articles: {
    'about-budget': {
      title: 'A cosa serve il budget',
      body: [
        'Il budget descrive un mese tipico: ciò che entra, ciò che esce e ciò che viene tenuto da parte. Lo aggiorni tu, non è un registro dei movimenti — l’app non vede mai la tua banca.',
        'Le voci stanno sotto intestazioni che scegli tu. Ogni voce ha un tipo, ed è quello che conta: entrate e uscite sono denaro che arriva e che se n’è andato, mentre risparmi, fatture e acquisti lasciano il tuo conto senza lasciare il tuo patrimonio.',
        'C’è un solo piano, non uno al mese. Quando qualcosa cambia abbastanza da valere la pena di ricordarlo — un aumento, un trasloco, una nuova assicurazione — scatta un’istantanea con un nome: continua a vivere accanto a essa.',
      ],
    },

    'pillar-3a': {
      title: 'Pilastro 3a',
      body: [
        'Il pilastro 3a è la parte fiscalmente privilegiata della previdenza privata. Quanto versi lo puoi dedurre dal reddito imponibile dello stesso anno, ed è in gran misura la ragione per cui esiste.',
        'È soggetto a un massimale. Ogni anno la legge fissa un importo, diverso a seconda che tu sia già affiliato a una cassa pensioni oppure no. L’importo è fissato dalla Confederazione e cambia periodicamente, perciò qui non è riportato: quello in vigore lo pubblica l’amministrazione delle contribuzioni.',
        'Il denaro resta vincolato fin verso l’età di pensionamento, con poche eccezioni: acquistare un’abitazione in cui vivi, lasciare definitivamente la Svizzera, o metterti in proprio.',
        'Tutto ciò che va oltre quel tetto, e ciò che vuoi poter ritirare, è pilastro 3b: risparmio e investimenti ordinari — nessun limite, nessuna deduzione.',
      ],
      sources: [
        {
          label: 'ch.ch — il 3° pilastro',
          url: 'https://www.ch.ch/it/pensionamento/rendita-di-vecchiaia/il-3-pilastro/',
        },
        {
          label: 'Amministrazione federale delle contribuzioni — deduzioni massime pilastro 3a',
          url: 'https://www.estv.admin.ch/it/tassi-interesse-deduzioni-massime-pilastro-3a-imposta-federale-diretta',
        },
      ],
    },
  },
}

export default it
