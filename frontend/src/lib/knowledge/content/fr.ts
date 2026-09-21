import type { PartialContent } from '../content'

/**
 * Français, au vouvoiement comme le reste du catalogue, avec l’apostrophe
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
      body: 'Cette application n’a aucun lien avec votre banque et ne voit jamais vos dépenses réelles. Le budget dit plutôt combien doit rester à la fin du mois, pour que les engagements à venir soient toujours couverts.',
    },
    places: {
      title: 'Les différents écrans',
      body: 'Budget, c’est là que vous planifiez un mois. Comptes montre les soldes réels correspondants. Savoir abrite cette visite et de courts textes sur les finances suisses.',
    },
    types: {
      title: 'Différentes entrées budgétaires',
      body: 'Il en existe plusieurs types, présentés l’un après l’autre.',
    },
    budget: {
      title: 'Un plan permanent',
      body: 'Pas un journal mensuel. Vous décrivez un mois type une seule fois, et vous prenez un instantané nommé quand quelque chose change assez pour mériter d’être gardé.',
      note: 'Nous utilisons des valeurs suisses par défaut à titre d’illustration.',
    },
    controls: {
      title: 'Les commandes',
      body: 'Tout ce qui agit sur l’écran entier se trouve ici.',
      hoverNote: 'Survolez un symbole pour voir ce qu’il fait.',
    },
    accounts: {
      title: 'Comptes',
      body: 'Ici figure tout ce que vous détenez, en banque ou ailleurs. Ajoutez l’IBAN et les informations qui vont avec, et vous pourrez générer des QR-factures payables dessus.',
    },
    allocations: {
      title: 'Affectations',
      body: 'Vous reliez ici chaque entrée budgétaire à la provenance et à la destination de son argent. Votre salaire arrive sur le compte principal ; la provision pour l’ordinateur portable et la facture Serafe partent là où elles ne seront pas dépensées. Il en ressort un solde pour chacun et une projection des réserves nécessaires.',
    },
    knowledge: {
      title: 'Vous pouvez revenir',
      body: 'La visite repart d’ici, à côté des articles sur chaque vue et sur l’argent suisse. Rien de ce que vous venez de voir n’est à mémoriser.',
    },
  },
  articles: {
    'about-budget': {
      title: 'À quoi sert le budget',
      body: [
        'Le budget décrit un mois ordinaire : ce qui entre, ce qui sort et ce qui est mis de côté. Vous le tenez à jour ; ce n’est pas un relevé d’opérations — l’application ne voit jamais votre banque.',
        'Les entrées sont regroupées sous des titres que vous choisissez. Chaque entrée a un type, et c’est lui qui importe : revenus et dépenses sont de l’argent qui arrive et qui repart, tandis que l’épargne, les factures et les achats quittent votre compte sans quitter votre patrimoine.',
        'Il y a un seul plan, pas un par mois. Quand quelque chose change assez pour mériter d’être retenu — une augmentation, un déménagement, une nouvelle assurance —, prenez un instantané nommé : il continue de vivre en parallèle.',
      ],
    },

    'pillar-3a': {
      title: 'Pilier 3a',
      body: [
        'Le pilier 3a est la part fiscalement privilégiée de la prévoyance privée. Ce que vous y versez se déduit de votre revenu imposable de la même année, et c’est l’essentiel de sa raison d’être.',
        'Il est plafonné. Un maximum légal s’applique chaque année, et il diffère selon que vous êtes déjà affilié à une caisse de pension ou non. Le montant est fixé par la Confédération et change périodiquement : il n’est donc pas repris ici, l’administration fiscale publie celui qui est en vigueur.',
        'L’argent est bloqué jusqu’à l’approche de l’âge de la retraite, avec une courte liste d’exceptions : acheter un logement que vous habitez, quitter définitivement la Suisse, ou vous mettre à votre compte.',
        'Tout ce qui dépasse ce plafond, et ce que vous voulez pouvoir retirer, relève du pilier 3b : épargne et placements ordinaires, ni limite ni déduction.',
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
