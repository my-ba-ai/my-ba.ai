CREATE TABLE "abs_sal_tenure" (
	"sal_code" text NOT NULL,
	"census_year" integer NOT NULL,
	"tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
	"name" text NOT NULL,
	"state" "au_state" NOT NULL,
	"rented_dwellings" integer NOT NULL,
	"tenure_not_stated" integer NOT NULL,
	"occupied_private_dwellings" integer NOT NULL,
	"renter_proportion" double precision,
	"source_sha256" text NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abs_sal_tenure_pkey" PRIMARY KEY("sal_code","census_year"),
	CONSTRAINT "abs_sal_tenure_system_tenant_only" CHECK ("abs_sal_tenure"."tenant_id" = '00000000-0000-0000-0000-000000000000'::uuid),
	CONSTRAINT "abs_sal_tenure_sal_code_check" CHECK ("abs_sal_tenure"."sal_code" ~ '^SAL[0-9]{5}$'),
	CONSTRAINT "abs_sal_tenure_counts_check" CHECK ("abs_sal_tenure"."rented_dwellings" >= 0 and "abs_sal_tenure"."tenure_not_stated" >= 0 and "abs_sal_tenure"."occupied_private_dwellings" >= 0),
	CONSTRAINT "abs_sal_tenure_renter_proportion_check" CHECK ("abs_sal_tenure"."renter_proportion" is null or ("abs_sal_tenure"."renter_proportion" >= 0 and "abs_sal_tenure"."renter_proportion" <= 1))
);
--> statement-breakpoint
ALTER TABLE "suburbs" ADD COLUMN "abs_sal_match" text;--> statement-breakpoint
ALTER TABLE "abs_sal_tenure" ADD CONSTRAINT "abs_sal_tenure_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abs_sal_tenure_tenant_id_idx" ON "abs_sal_tenure" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "suburbs" ADD CONSTRAINT "suburbs_abs_sal_match_check" CHECK ("suburbs"."abs_sal_match" is null or "suburbs"."abs_sal_match" in ('name', 'htag_concordance', 'unmatched'));--> statement-breakpoint
ALTER TABLE "suburbs" ADD CONSTRAINT "suburbs_abs_sal_code_match_check" CHECK (("suburbs"."abs_sal_code" is not null) = coalesce("suburbs"."abs_sal_match" in ('name', 'htag_concordance'), false));