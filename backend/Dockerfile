FROM golang:1.27-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /finance-tracker .

FROM alpine:3.24
COPY --from=builder /finance-tracker /finance-tracker
COPY migrations/ /migrations/
EXPOSE 8080
CMD ["/finance-tracker"]
