-- Script de inicialização para banco de teste
CREATE DATABASE treinopro_test;
CREATE USER test WITH PASSWORD 'test';
GRANT ALL PRIVILEGES ON DATABASE treinopro_test TO test;
