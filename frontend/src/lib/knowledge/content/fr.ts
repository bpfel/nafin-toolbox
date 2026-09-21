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
      body: 'Nous ne nous connectons pas à vos comptes bancaires et nous ne consultons pas vos dépenses réelles. Le budget définit plutôt ce qui doit rester à la fin du mois, afin que vos engagements financiers à venir soient toujours couverts.',
    },
    places: {
      title: 'Les différents écrans',
      body: 'Budget, c’est là que vous définissez vos flux mensuels. Comptes définit comment l’argent circule entre vos comptes bancaires. Savoir est le point de départ de cette visite et renvoie à des sources officielles sur les finances personnelles suisses. Profil contient vos réglages personnels.',
    },
    types: {
      title: 'Cinq types d’entrées budgétaires',
      body: 'Une entrée budgétaire n’est pas qu’un montant — son type dit ce qu’il advient de l’argent.',
    },
    budget: {
      title: 'Un plan permanent',
      body: 'Pas un journal mensuel. Vous décrivez une seule fois un mois type, et vous prenez un instantané nommé quand quelque chose change assez pour mériter d’être retenu.',
    },
    controls: {
      title: 'Les commandes',
      body: 'Pour agir sur l’écran en cours, utilisez ces commandes.',
      hoverNote: 'Survolez un symbole pour voir ce qu’il fait.',
    },
    accounts: {
      title: 'Où se trouve l’argent',
      body: 'Un compte est un endroit réel avec un solde réel : compte salaire, compte d’épargne, espèces dans un tiroir. Vous indiquez à l’application ce qu’il contient et quand vous avez vérifié pour la dernière fois. Ajoutez un IBAN et les informations qui vont avec, et vous pourrez générer des QR-factures payables sur ce compte.',
    },
    allocations: {
      title: 'Deux vues ici',
      body: 'Comptes liste les soldes. Affectations répond à la question plus difficile — de quel compte sort chaque entrée du budget, et sur lequel elle arrive.',
    },
    knowledge: {
      title: 'Vous pouvez revenir',
      body: 'Cette visite se trouve ici, avec de courts textes sur l’usage de chaque vue et sur le fonctionnement des finances suisses. Rien de ce que vous venez de voir n’est à retenir.',
    },
  },
  articles: {
    'about-budget': {
      title: 'À quoi sert le budget',
      body: [
        'Le budget décrit un mois type : ce qui entre, ce qui sort et ce qui est mis de côté. C’est un plan que vous tenez à jour, pas un relevé d’opérations — l’application ne voit jamais votre banque.',
        'Les entrées sont regroupées sous des titres que vous choisissez. Chaque entrée a un type, et c’est lui qui compte : revenus et dépenses sont de l’argent qui arrive et de l’argent parti, tandis que l’épargne, les factures et les achats quittent votre compte sans quitter votre patrimoine.',
        'Il y a un seul plan, pas un par mois. Quand quelque chose change assez pour mériter d’être retenu — une augmentation, un déménagement, une nouvelle assurance —, prenez un instantané nommé : le plan continue de vivre à côté.',
      ],
    },

    'pillar-3a': {
      title: 'Pilier 3a',
      body: [
        'Le pilier 3a est la part fiscalement privilégiée de la prévoyance privée. Ce que vous y versez dans l’année se déduit de votre revenu imposable de cette année-là, et c’est l’essentiel de sa raison d’être.',
        'Il est plafonné. Un maximum légal s’applique chaque année, et il diffère selon que vous êtes déjà affilié à une caisse de pension ou non. Le montant est fixé par la Confédération et change de temps à autre : il n’est donc pas repris ici, l’administration fiscale publie celui qui est en vigueur.',
        'L’argent est bloqué jusqu’à l’approche de l’âge de la retraite, avec une courte liste d’exceptions : acheter un logement que vous habitez, quitter définitivement la Suisse, ou vous mettre à votre compte.',
        'Tout ce qui dépasse ce plafond, et tout ce que vous voulez pouvoir retirer, relève du pilier 3b : épargne et placements ordinaires, sans plafond et sans déduction.',
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
