CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL
);
