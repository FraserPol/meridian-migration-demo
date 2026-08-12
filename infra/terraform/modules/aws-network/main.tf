# Meridian's VPC. This is the "existing AWS VPC" that stays in place per
# solution-architecture.md — Vercel Secure Compute peers into it (see the
# hcp-vault module's HVN peering and, for the app itself, Vercel's own
# Secure Compute peering acceptance, which happens in the Vercel dashboard
# / vercel_secure_compute_network resource once that's GA'd in the
# provider — tracked as a known limitation in README.md).

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "meridian-${var.environment}"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "meridian-${var.environment}-private-${count.index}"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "meridian-${var.environment}-private"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_db_subnet_group" "main" {
  name       = "meridian-${var.environment}"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "meridian-${var.environment}-db-subnet-group"
  }
}

# Security group for RDS: no public ingress. In production, ingress is
# scoped to the Secure Compute peering connection's CIDR once it's
# established (see infra/terraform/README.md, Phase 2) — left as a
# same-VPC-only rule here since the peering connection ID doesn't exist
# until Vercel's side of Secure Compute is provisioned interactively.
resource "aws_security_group" "rds" {
  name        = "meridian-${var.environment}-rds"
  description = "Allow Postgres from within the VPC (and, post Secure Compute setup, from the peered Vercel network)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Postgres from within the VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "Postgres from HCP HVN (Vault database secrets engine)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.hvn_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "meridian-${var.environment}-rds-sg"
  }
}
