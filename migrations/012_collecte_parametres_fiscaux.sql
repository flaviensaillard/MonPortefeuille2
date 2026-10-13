-- À appliquer UNE SEULE FOIS après sauvegarde/restauration vérifiée et accord
-- du propriétaire. Élargit la collecte append-only ; ne publie aucune règle
-- complète, ne touche ni aux R1 ni à la R2 2025. Ne pas rejouer 009/010/011.
begin;
alter table public.pf2_fiscal_collectes
    drop constraint if exists pf2_fiscal_collectes_source_check;
alter table public.pf2_fiscal_collectes
    add constraint pf2_fiscal_collectes_source_check
    check (source in ('openfisca_bareme_ir', 'openfisca_parametres'));
alter table public.pf2_fiscal_collectes
    drop constraint if exists pf2_fiscal_collectes_source_url_check;
alter table public.pf2_fiscal_collectes
    add constraint pf2_fiscal_collectes_source_url_check check (
        (source = 'openfisca_bareme_ir' and source_url =
            'https://api.fr.openfisca.org/latest/parameter/impot_revenu/bareme_ir_depuis_1945/bareme')
        or (source = 'openfisca_parametres' and source_url =
            'https://api.fr.openfisca.org/latest/parameter')
    );
commit;
