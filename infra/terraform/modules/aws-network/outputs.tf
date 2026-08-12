output "vpc_id" {
  value = aws_vpc.main.id
}

output "vpc_cidr" {
  value = aws_vpc.main.cidr_block
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "db_subnet_group_name" {
  value = aws_db_subnet_group.main.name
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "private_route_table_id" {
  value = aws_route_table.private.id
}
