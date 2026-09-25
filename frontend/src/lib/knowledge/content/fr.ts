import type { PartialContent } from '../content'

/**
 * Français, au tutoiement comme le reste du catalogue, avec l’apostrophe
 * typographique et l’espace avant le deux-points que `locales/fr.ts` emploie
 * déjà.
 *
 * Et les mots que l’interface utilise elle-même : Budget, Comptes,
 * Affectations, instantané, Savoir, Profil. Une visite qui nomme les choses
 * autrement que les écrans qu’elle explique n’explique rien.
 *
 * Complet : la visite et les articles. Le module reste `Partial` — un article
 * ajouté plus tard peut n’exister d’abord qu’en anglais, et la fiche le dira
 * franchement plutôt que de faire passer la langue de repli pour une traduction.
 *
 * Les sources pointent vers les versions françaises des pages officielles.
 * Renvoyer un lecteur francophone vers une page anglaise serait une traduction
 * à moitié faite.
 */
export const fr: PartialContent = {
  tour: {
    welcome: {
      title: 'Un planificateur',
      body: 'Cette application n’a aucun lien avec ta banque et ne voit jamais tes dépenses réelles. Le budget dit plutôt combien doit rester à la fin du mois, pour que les engagements à venir soient toujours couverts.',
    },
    places: {
      title: 'Les différents écrans',
      body: 'Budget, c’est là que tu planifies un mois. Comptes montre les soldes réels correspondants. Savoir abrite cette visite et de courts textes sur les finances suisses.',
    },
    types: {
      title: 'Différentes entrées budgétaires',
      body: 'Il en existe plusieurs types, présentés l’un après l’autre.',
    },
    budget: {
      title: 'Un plan permanent',
      body: 'Pas un journal mensuel. Tu décris un mois type une seule fois, et tu prends un instantané nommé quand quelque chose change assez pour mériter d’être gardé.',
      note: 'Nous utilisons des valeurs suisses par défaut à titre d’illustration.',
    },
    controls: {
      title: 'Les commandes',
      body: 'Toutes les options pour l’écran en cours sont ici.',
      hoverNote: 'Survole un symbole pour voir ce qu’il fait.',
    },
    accounts: {
      title: 'Comptes',
      body: 'Ici figure tout ce que tu détiens, en banque ou ailleurs. Ajoute l’IBAN et les informations qui vont avec, et tu pourras générer des QR-factures payables dessus.',
    },
    allocations: {
      title: 'Affectations',
      body: 'Tu relies ici chaque entrée budgétaire à la provenance et à la destination de son argent. Ton salaire arrive sur le compte principal ; la provision pour l’ordinateur portable et la facture Serafe partent là où elles ne seront pas dépensées. Il en ressort un solde pour chacun et une projection des réserves nécessaires.',
    },
    knowledge: {
      title: 'Tu peux revenir',
      body: 'La visite repart d’ici, à côté des articles sur chaque vue et sur l’argent suisse. Rien de ce que tu viens de voir n’est à mémoriser.',
    },
    sharedWhat: {
      title: 'Partage le plaisir',
      body: 'Un ménage est un budget secondaire que tu peux partager avec d’autres.',
    },
    sharedStart: {
      title: 'Mise en place',
      body: 'Les ménages se gèrent dans le profil.',
    },
    sharedInvite: {
      title: 'Inviter d’autres personnes',
      body: 'Déplie un ménage pour y inviter quelqu’un. Pour l’invitation, utilise son e-mail de compte et donne-lui le lien de partage — copié, ou sous forme de QR code. Tu décides si la personne peut seulement lire le budget partagé ou aussi le modifier.',
    },
    sharedSwitch: {
      title: 'Changer de budget',
      body: 'Dès que tu appartiens à un ménage, tu gères plusieurs budgets. Le point indique celui sur lequel tu travailles et permet d’en changer.',
      wideBody: 'Dès que tu appartiens à un ménage, tu gères plusieurs budgets. La barre du haut indique celui sur lequel tu travailles et permet d’en changer.',
    },
    sharedEntries: {
      title: 'Les différentes entrées',
      body: 'Tout comme ton budget personnel, un ménage propose les mêmes types d’entrée. Prends ceux dont tu as besoin pour planifier les dépenses communes.',
      note: 'Les chiffres présentés sont un exemple, pour un ménage de deux personnes.',
    },
    sharedContributions: {
      title: 'Recettes du ménage',
      body: 'Le côté recettes d’un budget de ménage est le plus souvent la somme de contributions individuelles, et non un salaire entier.',
    },
    sharedKnowledge: {
      title: 'Tu peux revenir',
      body: 'Ce parcours recommence depuis ici, à côté de la visite guidée et des articles. Rien de ce que tu viens de voir n’est à retenir.',
    },
  },
  articles: {
    'about-budget': {
      title: 'À quoi sert le budget',
      body: [
        'Le budget décrit un mois ordinaire : ce qui entre, ce qui sort et ce qui est mis de côté. Tu le tiens à jour ; ce n’est pas un relevé d’opérations — l’application ne voit jamais ta banque.',
        'Les entrées sont regroupées sous des titres que tu choisis. Chaque entrée a un type, et c’est lui qui importe : revenus et dépenses sont de l’argent qui arrive et qui repart, tandis que l’épargne, les factures et les achats quittent ton compte sans quitter ton patrimoine.',
        'Il y a un seul plan, pas un par mois. Quand quelque chose change assez pour mériter d’être retenu — une augmentation, un déménagement, une nouvelle assurance —, prends un instantané nommé : il continue de vivre en parallèle.',
      ],
    },

    'pillar-3a': {
      title: 'Pilier 3a',
      body: [
        'Le pilier 3a est la part fiscalement privilégiée de la prévoyance privée. Ce que tu y verses se déduit de ton revenu imposable de la même année, et c’est l’essentiel de sa raison d’être.',
        'Il est plafonné. Un maximum légal s’applique chaque année, et il diffère selon que tu es déjà affilié à une caisse de pension ou non. Le montant est fixé par la Confédération et change périodiquement : il n’est donc pas repris ici, l’administration fiscale publie celui qui est en vigueur.',
        'L’argent est bloqué jusqu’à l’approche de l’âge de la retraite, avec une courte liste d’exceptions : acheter un logement que tu habites, quitter définitivement la Suisse, ou te mettre à ton compte.',
        'Tout ce qui dépasse ce plafond, et ce que tu veux pouvoir retirer, relève du pilier 3b : épargne et placements ordinaires, ni limite ni déduction.',
      ],
      sources: [
        {
          label: 'ch.ch — le 3e pilier',
          url: 'https://www.ch.ch/fr/retraite/rente-de-vieillesse/le-3e-pilier/',
        },
        {
          label: 'Administration fédérale des contributions — déductions maximales pilier 3a',
          url: 'https://www.estv.admin.ch/fr/taux-interet-deductions-maximales-pilier-3a-impot-federal-direct',
        },
      ],
    },
  },
}

export default fr
